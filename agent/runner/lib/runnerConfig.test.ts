// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { makeTempDir } from '../../test/tempDir.ts'
import type { TempDir } from '../../test/tempDir.ts'
import { loadDailyRunConfig, loadDraftConfig, loadEngineConfig, loadRunnerConfig, loadSourcesConfig } from './runnerConfig.ts'

let dir: TempDir

beforeEach(() => {
  dir = makeTempDir()
})

afterEach(() => {
  dir.remove()
})

function writeConfig(value: unknown): string {
  return dir.write('config.json', JSON.stringify(value))
}

test('missing keys take their defaults and other keys are ignored', () => {
  const path = writeConfig({ ollamaUrl: 'http://laptop.example:11434', corpus: [] })

  expect(loadRunnerConfig(path)).toEqual({
    titleRules: { reject: [] },
    evaluation: { concurrency: 2, perRunCap: 10, timeoutMs: 300000 },
    prescreen: { concurrency: 4, perRunCap: 40, timeoutMs: 120000 },
  })
})

test('configured values win over the defaults', () => {
  const path = writeConfig({
    titleRules: { reject: ['trainee'] },
    evaluation: { concurrency: 4 },
    prescreen: { perRunCap: 5 },
  })

  expect(loadRunnerConfig(path)).toEqual({
    titleRules: { reject: ['trainee'] },
    evaluation: { concurrency: 4, perRunCap: 10, timeoutMs: 300000 },
    prescreen: { concurrency: 4, perRunCap: 5, timeoutMs: 120000 },
  })
})

test.each([
  ['a concurrency above 8', { evaluation: { concurrency: 9 } }, 'evaluation.concurrency'],
  ['a fractional cap', { evaluation: { perRunCap: 1.5 } }, 'evaluation.perRunCap'],
  ['an empty reject phrase', { titleRules: { reject: [''] } }, 'titleRules.reject[0]'],
  ['a pre-screen concurrency above 8', { prescreen: { concurrency: 9 } }, 'prescreen.concurrency'],
  ['a pre-screen cap below 1', { prescreen: { perRunCap: 0 } }, 'prescreen.perRunCap'],
])('%s is an exit-2 error naming the field', (_name, value, field) => {
  const path = writeConfig(value)

  expect(() => loadRunnerConfig(path)).toThrow(
    expect.objectContaining({ exitCode: 2, message: expect.stringContaining(`${path}: ${field}: `) }),
  )
})

test('a missing file exits 2 naming it', () => {
  const path = `${dir.root}/missing.json`

  expect(() => loadRunnerConfig(path)).toThrow(expect.objectContaining({ exitCode: 2, message: `${path}: file not found` }))
})

test('bad JSON exits 2 naming the file', () => {
  const path = dir.write('config.json', '{ nope')

  expect(() => loadRunnerConfig(path)).toThrow(expect.objectContaining({ exitCode: 2, message: `${path}: invalid JSON` }))
})

describe('drafting', () => {
  const drafting = { filePrefix: 'Tester', cvTemplates: { fi: '/cv/fi.md', en: '/cv/en.md' } }

  test('missing keys take their defaults', () => {
    const path = writeConfig({ drafting })

    expect(loadDraftConfig(path)).toEqual({ concurrency: 1, perRunCap: 3, timeoutMs: 600000, ...drafting })
  })

  test('agent:evaluate does not need the drafting key', () => {
    expect(() => loadRunnerConfig(writeConfig({}))).not.toThrow()
  })

  test.each([
    ['a missing filePrefix', { cvTemplates: drafting.cvTemplates }, 'drafting.filePrefix'],
    ['missing cvTemplates', { filePrefix: 'Tester' }, 'drafting.cvTemplates'],
    ['a relative template path', { ...drafting, cvTemplates: { fi: 'cv/fi.md', en: '/cv/en.md' } }, 'drafting.cvTemplates.fi'],
    ['a concurrency above 4', { ...drafting, concurrency: 5 }, 'drafting.concurrency'],
  ])('%s is an exit-2 error naming the field', (_name, value, field) => {
    const path = writeConfig({ drafting: value })

    expect(() => loadDraftConfig(path)).toThrow(
      expect.objectContaining({ exitCode: 2, message: expect.stringContaining(`${path}: ${field}: `) }),
    )
  })
})

describe('sources', () => {
  const fetchAd = () => Promise.resolve({ kind: 'gone' as const })
  const connectors = [
    { id: 'auto', fetchAd },
    { id: 'manual' },
    { id: 'fetching', fetchAd },
  ]
  const load = (sources: unknown) => loadSourcesConfig(writeConfig({ sources }), connectors)

  test('missing keys take their defaults and a missing source is disabled', () => {
    expect(load({ auto: { enabled: true, termsCheckedOn: '2026-11-20' } })).toEqual({
      auto: { enabled: true, termsCheckedOn: '2026-11-20', dailyOpenCap: 20, minDelayMs: 15000, fetch: 'requested' },
      manual: { enabled: false, dailyOpenCap: 20, minDelayMs: 15000, fetch: 'requested' },
      fetching: { enabled: false, dailyOpenCap: 20, minDelayMs: 15000, fetch: 'requested' },
    })
  })

  test('caps are overridable per source', () => {
    const config = load({ auto: { enabled: true, termsCheckedOn: '2026-11-20', dailyOpenCap: 5, minDelayMs: 2000 } })

    expect(config.auto).toMatchObject({ dailyOpenCap: 5, minDelayMs: 2000 })
  })

  test('a source that never fetches is enabled without a terms check', () => {
    expect(load({ manual: { enabled: true } }).manual.enabled).toBe(true)
  })

  test('fetch is read', () => {
    const config = load({ fetching: { enabled: true, termsCheckedOn: '2026-11-23', fetch: 'automatic' } })

    expect(config.fetching.fetch).toBe('automatic')
  })

  test.each(['auto', 'fetching'])('%s cannot be enabled before its terms are checked', (id) => {
    const path = writeConfig({ sources: { [id]: { enabled: true } } })

    expect(() => loadSourcesConfig(path, connectors)).toThrow(
      expect.objectContaining({
        exitCode: 2,
        message: `${path}: sources.${id}: termsCheckedOn is required to enable a source that fetches`,
      }),
    )
  })

  test('an unknown source id is an exit-2 error naming it', () => {
    const path = writeConfig({ sources: { manual: { enabled: true }, other: { enabled: false } } })

    expect(() => loadSourcesConfig(path, connectors)).toThrow(
      expect.objectContaining({ exitCode: 2, message: `${path}: sources.other: unknown source` }),
    )
  })

  test('no source enabled is an exit-2 error', () => {
    const path = writeConfig({ sources: { manual: { enabled: false } } })

    expect(() => loadSourcesConfig(path, connectors)).toThrow(
      expect.objectContaining({ exitCode: 2, message: `${path}: sources: no source is enabled` }),
    )
  })

  test.each([
    ['a cap below 1', { manual: { enabled: true, dailyOpenCap: 0 } }, 'sources.manual.dailyOpenCap'],
    ['a delay below 1000', { manual: { enabled: true, minDelayMs: 999 } }, 'sources.manual.minDelayMs'],
    ['a malformed terms date', { manual: { enabled: true, termsCheckedOn: '20.11.2026' } }, 'sources.manual.termsCheckedOn'],
    ['an unknown fetch mode', { manual: { enabled: true, fetch: 'always' } }, 'sources.manual.fetch'],
  ])('%s is an exit-2 error naming the field', (_name, sources, field) => {
    const path = writeConfig({ sources })

    expect(() => loadSourcesConfig(path, connectors)).toThrow(
      expect.objectContaining({ exitCode: 2, message: expect.stringContaining(`${path}: ${field}: `) }),
    )
  })
})

describe('daily run', () => {
  test('the wait defaults to 7 days and the recipient is read', () => {
    const path = writeConfig({ summary: { recipient: 'me@mail.example' } })

    expect(loadDailyRunConfig(path)).toEqual({
      handoverWaitDays: 7,
      summary: { recipient: 'me@mail.example', alwaysSend: false },
    })
  })

  test('alwaysSend is read', () => {
    const path = writeConfig({ summary: { recipient: 'me@mail.example', alwaysSend: true } })

    expect(loadDailyRunConfig(path).summary.alwaysSend).toBe(true)
  })

  test('lanUrl is read', () => {
    const path = writeConfig({ summary: { recipient: 'me@mail.example', lanUrl: 'https://192.0.2.1:3001' } })

    expect(loadDailyRunConfig(path).summary.lanUrl).toBe('https://192.0.2.1:3001')
  })

  test.each([
    ['no summary key', {}, 'summary'],
    ['a recipient that is not an address', { summary: { recipient: 'me' } }, 'summary.recipient'],
    ['an alwaysSend that is not a boolean', { summary: { recipient: 'me@mail.example', alwaysSend: 'yes' } }, 'summary.alwaysSend'],
    ['a lanUrl that is not a URL', { summary: { recipient: 'me@mail.example', lanUrl: '192.0.2.1:3001' } }, 'summary.lanUrl'],
    ['a lanUrl that is not http', { summary: { recipient: 'me@mail.example', lanUrl: 'ftp://192.0.2.1' } }, 'summary.lanUrl'],
    ['a zero wait', { handoverWaitDays: 0, summary: { recipient: 'me@mail.example' } }, 'handoverWaitDays'],
  ])('%s is an exit-2 error naming the field', (_name, value, field) => {
    const path = writeConfig(value)

    expect(() => loadDailyRunConfig(path)).toThrow(
      expect.objectContaining({ exitCode: 2, message: expect.stringContaining(`${path}: ${field}: `) }),
    )
  })
})

describe('loadEngineConfig', () => {
  const price = { inputPerMTok: 1, outputPerMTok: 5, cacheWritePerMTok: 1.25, cacheReadPerMTok: 0.1 }
  const allPrices = { 'claude-haiku-5-5': price, 'claude-sonnet-5-5': price, 'claude-opus-5-5': price }

  test('no engine key is cli, with the default models, effort and cap', () => {
    const path = writeConfig({ corpus: [] })

    expect(loadEngineConfig(path)).toEqual({
      engine: 'cli',
      api: {
        models: { prescreen: 'claude-haiku-5-5', evaluation: 'claude-sonnet-5-5', drafting: 'claude-opus-5-5' },
        effort: { prescreen: 'low', evaluation: 'medium', drafting: 'high' },
        perRunUsd: 3,
        monthlyUsd: 30,
        prices: {},
      },
    })
  })

  test('api with a price for every model loads', () => {
    const path = writeConfig({ engine: 'api', api: { prices: allPrices, effort: { drafting: 'medium' } } })

    const config = loadEngineConfig(path)

    expect(config.engine).toBe('api')
    expect(config.api.effort).toEqual({ prescreen: 'low', evaluation: 'medium', drafting: 'medium' })
  })

  test.each([
    ['an unknown engine', { engine: 'gpt' }, 'engine'],
    ['an effort outside low|medium|high', { api: { effort: { evaluation: 'max' } } }, 'api.effort.evaluation'],
    ['a zero run cap', { api: { perRunUsd: 0 } }, 'api.perRunUsd'],
    ['a zero monthly cap', { api: { monthlyUsd: 0 } }, 'api.monthlyUsd'],
    ['a negative monthly cap', { api: { monthlyUsd: -5 } }, 'api.monthlyUsd'],
    ['a negative price', { api: { prices: { m: { ...price, inputPerMTok: -1 } } } }, 'api.prices.m.inputPerMTok'],
  ])('%s is an exit-2 error naming the field', (_name, value, field) => {
    const path = writeConfig(value)

    expect(() => loadEngineConfig(path)).toThrow(
      expect.objectContaining({ exitCode: 2, message: expect.stringContaining(`${path}: ${field}:`) }),
    )
  })

  test('api with an unpriced model is an exit-2 error naming the model', () => {
    const { 'claude-opus-5-5': _opus, ...prices } = allPrices
    const path = writeConfig({ engine: 'api', api: { prices } })

    expect(() => loadEngineConfig(path)).toThrow(
      expect.objectContaining({
        exitCode: 2,
        message: `${path}: api.prices.claude-opus-5-5: no price for a model api.models names`,
      }),
    )
  })

  test('cli with no prices loads', () => {
    const path = writeConfig({ engine: 'cli' })

    expect(loadEngineConfig(path).engine).toBe('cli')
  })
})
