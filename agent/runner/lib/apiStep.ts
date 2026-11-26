import Anthropic from '@anthropic-ai/sdk'
import type { APIError } from '@anthropic-ai/sdk'
import { z } from 'zod'
import { CliError } from '../../lib/cliError.ts'
import type { SearchRequest, SearchResult } from '../../profile/lib/search.ts'
import { SEARCH_PROFILE_DESCRIPTION, searchRequestShape } from '../../profile/lib/searchTool.ts'
import type { RunBudget } from './apiBudget.ts'
import type { RunStep } from './evaluate.ts'
import type { FailureCategory, SandboxResult } from './sandbox.ts'

// Only what the step calls, so a fake can stand in for the SDK client.
export interface MessagesApi {
  create(body: Anthropic.MessageCreateParamsNonStreaming, options: { signal: AbortSignal }): Promise<Anthropic.Message>
}

export interface ApiStepOptions {
  messages: MessagesApi
  model: string
  effort: 'low' | 'medium' | 'high'
  prompt: string
  systemPrompt: string
  schema: Record<string, unknown>
  timeoutMs: number
  searchProfile: (request: SearchRequest) => Promise<SearchResult[]>
  budget: RunBudget
}

const MAX_TOOL_ROUNDS = 8
const EPHEMERAL = { type: 'ephemeral' } as const

const searchRequestSchema = z.object(searchRequestShape)

// The input view, so `limit` with its default is optional, as in the MCP tool.
const { $schema: _dialect, ...searchInputSchema } = z.toJSONSchema(searchRequestSchema, { io: 'input' })

const SEARCH_TOOL: Anthropic.Tool = {
  name: 'search_profile',
  description: SEARCH_PROFILE_DESCRIPTION,
  input_schema: { ...searchInputSchema, type: 'object' },
}

function failed(category: FailureCategory, detail?: string): SandboxResult {
  return { kind: 'failed', category, detail }
}

// What the run prints for a failed call: the status and the API's own message.
function apiErrorDetail(err: APIError): string {
  const detail = `${err.status ?? 'no response'}: ${err.apiMessage ?? err.message}`
  return err.requestID ? `${detail} (request ${err.requestID})` : detail
}

// The system block's breakpoint caches the tool and the system prompt, which
// every ad in a run shares; the top-level one caches one ad's tool rounds.
function requestBody(options: ApiStepOptions, messages: Anthropic.MessageParam[]): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: options.model,
    max_tokens: 16000,
    system: [{ type: 'text', text: options.systemPrompt, cache_control: EPHEMERAL }],
    cache_control: EPHEMERAL,
    thinking: { type: 'adaptive' },
    output_config: { effort: options.effort, format: { type: 'json_schema', schema: options.schema } },
    tools: [SEARCH_TOOL],
    messages,
  }
}

function toolError(id: string, message: string): Anthropic.ToolResultBlockParam {
  return { type: 'tool_result', tool_use_id: id, is_error: true, content: message }
}

// The model sees a bad input or a failed search and may try again; any other
// error is a bug and ends the step.
async function runTool(options: ApiStepOptions, block: Anthropic.ToolUseBlock): Promise<Anthropic.ToolResultBlockParam> {
  const parsed = searchRequestSchema.safeParse(block.input)
  if (!parsed.success) return toolError(block.id, z.prettifyError(parsed.error))
  try {
    const results = await options.searchProfile(parsed.data)
    return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(results, null, 2) }
  } catch (err) {
    if (!(err instanceof CliError)) throw err
    return toolError(block.id, err.message)
  }
}

function runTools(options: ApiStepOptions, content: Anthropic.ContentBlock[]): Promise<Anthropic.ToolResultBlockParam[]> {
  const uses = content.filter((block) => block.type === 'tool_use')
  return Promise.all(uses.map((block) => runTool(options, block)))
}

function parseOutput(text: string): SandboxResult {
  try {
    return { kind: 'ok', output: JSON.parse(text) }
  } catch {
    return failed('bad_output')
  }
}

// A refusal, truncation or pause is bad output like text that isn't JSON.
function finalResult(response: Anthropic.Message): SandboxResult {
  if (response.stop_reason !== 'end_turn') return failed('bad_output')
  const text = response.content.find((block) => block.type === 'text')
  if (!text) return failed('bad_output')
  return parseOutput(text.text)
}

// The assistant turn goes back unchanged, so its thinking blocks are kept.
async function converse(options: ApiStepOptions, input: string, signal: AbortSignal): Promise<SandboxResult> {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: `${options.prompt}\n\n${input}` }]
  for (let round = 0; ; round++) {
    const response = await options.messages.create(requestBody(options, messages), { signal })
    options.budget.charge(options.model, response.usage)
    if (response.stop_reason !== 'tool_use') return finalResult(response)
    if (round === MAX_TOOL_ROUNDS) return failed('bad_output')
    messages.push({ role: 'assistant', content: response.content })
    messages.push({ role: 'user', content: await runTools(options, response.content) })
  }
}

// A 401 or 403 will fail every later step too, so it stops the run's model
// steps. Errors from outside the SDK are bugs.
function failureFor(err: unknown, budget: RunBudget): SandboxResult {
  if (err instanceof Anthropic.APIUserAbortError || err instanceof Anthropic.APIConnectionTimeoutError) {
    return failed('timeout')
  }
  if (err instanceof Anthropic.AuthenticationError) budget.stop('Claude API: authentication failed')
  if (err instanceof Anthropic.PermissionDeniedError) budget.stop('Claude API: permission denied')
  if (err instanceof Anthropic.APIError) return failed('model_failed', apiErrorDetail(err))
  throw err
}

// One Messages conversation per call, bounded as a whole by timeoutMs.
export function createApiStep(options: ApiStepOptions): RunStep {
  return async (input) => {
    try {
      return await converse(options, input, AbortSignal.timeout(options.timeoutMs))
    } catch (err) {
      return failureFor(err, options.budget)
    }
  }
}
