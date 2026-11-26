// @vitest-environment node
import { APIConnectionError, APIConnectionTimeoutError } from '@anthropic-ai/sdk'
import { beforeEach, expect, test } from 'vitest'
import { apiError, fakeAnthropic, message, text, thinking, toolUse, USAGE } from '../../test/fakeAnthropic.ts'
import type { FakeReply } from '../../test/fakeAnthropic.ts'
import { CliError } from '../../lib/cliError.ts'
import type { SearchRequest, SearchResult } from '../../profile/lib/search.ts'
import { createRunBudget } from './apiBudget.ts'
import type { RunBudget } from './apiBudget.ts'
import { createApiStep } from './apiStep.ts'

const price = { inputPerMTok: 1_000_000, outputPerMTok: 0, cacheWritePerMTok: 0, cacheReadPerMTok: 0 }
const schema = { type: 'object', properties: { verdict: { type: 'string' } }, required: ['verdict'] }
const result: SearchResult = { source: 'cv.md', label: 'facts', text: 'Led a migration.', score: 0.9 }

let budget: RunBudget
let searches: SearchRequest[]
let search: (request: SearchRequest) => Promise<SearchResult[]>

beforeEach(() => {
  budget = createRunBudget({ perRunUsd: 1_000_000, prices: { 'claude-test': price } })
  searches = []
  search = async () => [result]
})

function step(replies: FakeReply[], timeoutMs = 5000) {
  const fake = fakeAnthropic(replies)
  const run = createApiStep({
    messages: fake.api,
    model: 'claude-test',
    effort: 'medium',
    prompt: 'Evaluate the job ad.',
    systemPrompt: 'You evaluate ads.',
    schema,
    timeoutMs,
    searchProfile: (request) => (searches.push(request), search(request)),
    budget,
  })
  return { fake, run }
}

const done = message('end_turn', [thinking('Fine.'), text('{"verdict":"suitable"}')])
const ok = { kind: 'ok', output: { verdict: 'suitable' } }
const badOutput = { kind: 'failed', category: 'bad_output' }

test('the request carries the model, effort, schema, both cache breakpoints and the one tool', async () => {
  const { fake, run } = step([done])

  await run('{"title":"Dev"}')

  const [request] = fake.requests
  expect(request).toMatchObject({
    model: 'claude-test',
    max_tokens: 16000,
    system: [{ type: 'text', text: 'You evaluate ads.', cache_control: { type: 'ephemeral' } }],
    cache_control: { type: 'ephemeral' },
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: 'Evaluate the job ad.\n\n{"title":"Dev"}' }],
  })
  expect(request.tools).toHaveLength(1)
  expect(request.tools?.[0]).toMatchObject({ name: 'search_profile', input_schema: { type: 'object', required: ['query'] } })
  expect(request.tools?.[0]).not.toHaveProperty('input_schema.$schema')
  expect(request).not.toHaveProperty('tool_choice')
})

test('a direct end_turn with JSON text is ok', async () => {
  const { run } = step([done])

  expect(await run('{}')).toEqual(ok)
})

test('tool rounds run the search with parsed input and echo the assistant turn unchanged', async () => {
  const first = message('tool_use', [thinking('Search.'), toolUse('t1', { query: 'migration' })])
  const second = message('tool_use', [toolUse('t2', { query: 'letters', label: 'style', limit: 2 })])
  const { fake, run } = step([first, second, done])

  expect(await run('{}')).toEqual(ok)

  expect(searches).toEqual([{ query: 'migration', limit: 5 }, { query: 'letters', label: 'style', limit: 2 }])
  const third = fake.requests[2].messages
  expect(third[1]).toEqual({ role: 'assistant', content: first.content })
  expect(third[2]).toEqual({
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: 't1', content: JSON.stringify([result], null, 2) }],
  })
  expect(third[3]).toEqual({ role: 'assistant', content: second.content })
})

test('several tool uses in one turn are answered in one user turn', async () => {
  const both = message('tool_use', [toolUse('a', { query: 'one' }), toolUse('b', { query: 'two' })])
  const { fake, run } = step([both, done])

  await run('{}')

  const answers = fake.requests[1].messages[2].content
  expect(answers).toMatchObject([{ tool_use_id: 'a' }, { tool_use_id: 'b' }])
})

test('an invalid tool input and a failed search each come back as an error result, and the loop goes on', async () => {
  search = async () => {
    throw new CliError(1, 'the profile index has no completed build: rebuild it')
  }
  const invalid = message('tool_use', [toolUse('bad', { query: '' })])
  const failing = message('tool_use', [toolUse('down', { query: 'migration' })])
  const { fake, run } = step([invalid, failing, done])

  expect(await run('{}')).toEqual(ok)

  expect(fake.requests[1].messages[2].content).toMatchObject([{ tool_use_id: 'bad', is_error: true }])
  expect(fake.requests[2].messages[4].content).toEqual([
    {
      type: 'tool_result',
      tool_use_id: 'down',
      is_error: true,
      content: 'the profile index has no completed build: rebuild it',
    },
  ])
})

test('a search failing with anything but a CliError is rethrown', async () => {
  search = async () => {
    throw new TypeError('bug')
  }
  const { run } = step([message('tool_use', [toolUse('t', { query: 'x' })])])

  await expect(run('{}')).rejects.toThrow('bug')
})

test('eight tool rounds are answered and a ninth is bad output', async () => {
  const round = () => message('tool_use', [toolUse('t', { query: 'again' })])
  const { fake, run } = step(Array.from({ length: 9 }, round))

  expect(await run('{}')).toEqual(badOutput)
  expect(searches).toHaveLength(8)
  expect(fake.requests).toHaveLength(9)
})

test.each([
  ['a refusal', message('refusal', [])],
  ['max_tokens', message('max_tokens', [text('{"verd')])],
  ['pause_turn', message('pause_turn', [])],
  ['no text block', message('end_turn', [thinking('Hmm.')])],
  ['text that is not JSON', message('end_turn', [text('I think it fits.')])],
])('%s is bad output', async (_name, reply) => {
  const { run } = step([reply])

  expect(await run('{}')).toEqual(badOutput)
})

test('a call that outlives timeoutMs is a timeout', async () => {
  const { run } = step(['hang'], 50)

  expect(await run('{}')).toEqual({ kind: 'failed', category: 'timeout' })
})

test('the SDK timeout error is a timeout', async () => {
  const { run } = step([new APIConnectionTimeoutError()])

  expect(await run('{}')).toEqual({ kind: 'failed', category: 'timeout' })
})

test.each([
  [401, 'Claude API: authentication failed'],
  [403, 'Claude API: permission denied'],
])('a %i is cli_failed and stops the run budget', async (status, reason) => {
  const { run } = step([apiError(status)])

  expect(await run('{}')).toEqual({ kind: 'failed', category: 'cli_failed' })
  expect(budget.canStart()).toBe(false)
  expect(budget.stopReason()).toBe(reason)
})

test.each([
  ['a 400', apiError(400)],
  ['a 500', apiError(500)],
  ['a connection error', new APIConnectionError({ message: 'reset' })],
])('%s is cli_failed and leaves the budget open', async (_name, error) => {
  const { run } = step([error])

  expect(await run('{}')).toEqual({ kind: 'failed', category: 'cli_failed' })
  expect(budget.canStart()).toBe(true)
})

test('an error from outside the SDK is rethrown', async () => {
  const { run } = step([new TypeError('bug')])

  await expect(run('{}')).rejects.toThrow('bug')
})

test('every response is charged to the budget', async () => {
  // 100 input tokens at $1 each per response: two responses reach a $200 cap.
  budget = createRunBudget({ perRunUsd: 2 * USAGE.input_tokens, prices: { 'claude-test': price } })
  const { run } = step([message('tool_use', [toolUse('t', { query: 'x' })]), done])

  await run('{}')

  expect(budget.stopReason()).toBe('API run cap reached at $200.00')
})
