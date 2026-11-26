// Stands in for the Messages API as the narrow MessagesApi the API step
// takes. Each create call takes the next scripted reply: a Message, an error
// (thrown) or 'hang', which rejects only when the call's signal aborts.
import { APIError, APIUserAbortError } from '@anthropic-ai/sdk'
import type Anthropic from '@anthropic-ai/sdk'
import type { MessagesApi } from '../runner/lib/apiStep.ts'

export type FakeReply = Anthropic.Message | Error | 'hang'

export interface FakeAnthropic {
  api: MessagesApi
  // Every request body, copied as it was when sent.
  requests: Anthropic.MessageCreateParamsNonStreaming[]
}

function hang(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new APIUserAbortError()))
  })
}

export function fakeAnthropic(replies: FakeReply[]): FakeAnthropic {
  const requests: Anthropic.MessageCreateParamsNonStreaming[] = []
  const api: MessagesApi = {
    create: async (body, { signal }) => {
      requests.push(structuredClone(body))
      const reply = replies.shift()
      if (reply === undefined) throw new Error('fakeAnthropic: no reply left')
      if (reply === 'hang') return hang(signal)
      if (reply instanceof Error) throw reply
      return reply
    },
  }
  return { api, requests }
}

export const USAGE: Anthropic.Usage = {
  input_tokens: 100,
  output_tokens: 20,
  cache_creation_input_tokens: null,
  cache_read_input_tokens: null,
  cache_creation: null,
  inference_geo: null,
  output_tokens_details: null,
  server_tool_use: null,
  service_tier: 'standard',
  speed: null,
}

export function message(stopReason: Anthropic.StopReason, content: Anthropic.ContentBlock[]): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-test',
    container: null,
    diagnostics: null,
    stop_details: null,
    stop_sequence: null,
    stop_reason: stopReason,
    content,
    usage: USAGE,
  }
}

export function text(value: string): Anthropic.TextBlock {
  return { type: 'text', text: value, citations: null }
}

export function thinking(value: string): Anthropic.ThinkingBlock {
  return { type: 'thinking', thinking: value, signature: 'sig' }
}

export function toolUse(id: string, input: unknown): Anthropic.ToolUseBlock {
  return { type: 'tool_use', id, name: 'search_profile', input, caller: { type: 'direct' } }
}

// The SDK's own subclass for the status, as a real failed response gives.
export function apiError(status: number): APIError {
  const body = { type: 'error', error: { type: 'api_error', message: `status ${status}` } }
  return APIError.generate(status, body, `status ${status}`, new Headers())
}
