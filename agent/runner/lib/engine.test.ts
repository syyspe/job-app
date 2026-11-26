// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { fakeAnthropic, message, text } from '../../test/fakeAnthropic.ts'
import { makeTempDir } from '../../test/tempDir.ts'
import type { TempDir } from '../../test/tempDir.ts'
import { UNLIMITED } from './apiBudget.ts'
import { createEngine } from './engine.ts'
import type { EngineConfig } from './runnerConfig.ts'

let dir: TempDir

beforeEach(() => {
  dir = makeTempDir()
})

afterEach(() => {
  dir.remove()
})

const price = { inputPerMTok: 1, outputPerMTok: 1, cacheWritePerMTok: 1, cacheReadPerMTok: 1 }

function config(engine: 'cli' | 'api'): EngineConfig {
  return {
    engine,
    api: {
      models: { prescreen: 'model-p', evaluation: 'model-e', drafting: 'model-d' },
      effort: { prescreen: 'low', evaluation: 'medium', drafting: 'high' },
      perRunUsd: 3,
      prices: { 'model-p': price, 'model-e': price, 'model-d': price },
    },
  }
}

const search = async () => []
const spec = { prompt: 'Go.', systemPrompt: 'Rules.', schema: { type: 'object' }, timeoutMs: 1000 }

test('api with no key in the env file is an exit-2 error', () => {
  const envFile = dir.write('env', 'JOBAPP_USERNAME=runner\n')

  expect(() => createEngine(config('api'), { env: {}, envFile, searchProfile: search })).toThrow(
    expect.objectContaining({ exitCode: 2, message: `${envFile}: ANTHROPIC_API_KEY is not set` }),
  )
})

test.each([
  ['prescreen', 'model-p', 'low'],
  ['evaluation', 'model-e', 'medium'],
  ['drafting', 'model-d', 'high'],
] as const)('api runs the %s step on its own model and effort', async (step, model, effort) => {
  const envFile = dir.write('env', 'ANTHROPIC_API_KEY=sk-test\n')
  const fake = fakeAnthropic([message('end_turn', [text('{}')])])
  const engine = createEngine(config('api'), { env: {}, envFile, searchProfile: search, messages: fake.api })

  expect(await engine.stepFor({ step, ...spec })('{}')).toEqual({ kind: 'ok', output: {} })

  expect(engine.kind).toBe('api')
  expect(fake.requests[0]).toMatchObject({ model, output_config: { effort } })
})

test('cli needs no key and has an unlimited budget', () => {
  const engine = createEngine(config('cli'), { env: {}, envFile: `${dir.root}/missing`, searchProfile: search })

  expect(engine.kind).toBe('cli')
  expect(engine.budget).toBe(UNLIMITED)
})
