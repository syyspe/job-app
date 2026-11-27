// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { startFakeJobApp } from '../../test/fakeJobApp.ts'
import type { FakeJobApp } from '../../test/fakeJobApp.ts'
import { fakeAd } from '../../test/fakeJobAppAds.ts'
import type { FakeAd } from '../../test/fakeJobAppAds.ts'
import { makeTempDir } from '../../test/tempDir.ts'
import type { TempDir } from '../../test/tempDir.ts'
import { runFetch } from './fetchRun.ts'
import { createJobAppClient } from './jobApp.ts'
import type { SourceConfig } from './runnerConfig.ts'
import type { FetchResult, PoliteHttp, SourceConnector } from './sources/types.ts'
import { createRunnerState } from './state.ts'
import type { RunnerState } from './state.ts'

let fake: FakeJobApp
let dir: TempDir
let state: RunnerState
let fetched: string[]

beforeEach(async () => {
  fake = await startFakeJobApp()
  dir = makeTempDir()
  state = createRunnerState(dir.root)
  fetched = []
})

afterEach(async () => {
  dir.remove()
  await fake.close()
})

function connector(id: string, results: FetchResult[] = []): SourceConnector {
  return {
    id,
    mode: 'handover',
    fetchHosts: [`${id}.example`],
    matches: () => false,
    parseAlert: () => [],
    fetchAd: async (candidate) => (fetched.push(candidate.url), results.shift() ?? { kind: 'ok', text: 'The ad.' }),
  }
}

const config = (fetch: SourceConfig['fetch']): SourceConfig => ({
  enabled: true,
  termsCheckedOn: '2026-11-23',
  dailyOpenCap: 20,
  minDelayMs: 1000,
  fetch,
})

function waiting(id: number, fields: Partial<FakeAd> = {}): FakeAd {
  return fakeAd({ id, source: 'duuni', sourceMode: 'handover', state: 'awaiting_handover', url: `https://duuni.example/${id}`, ...fields })
}

const clicked = { fetchRequestedAt: '2026-11-23 09:00:00' }
const promising = { prescreen: { verdict: 'promising' as const, reason: 'Fits.' } }
const notPromising = { prescreen: { verdict: 'not_promising' as const, reason: 'No.' } }

interface RunSetup {
  connectors: SourceConnector[]
  sources: Record<string, SourceConfig>
  http?: PoliteHttp
}

function run({ connectors, sources, http }: RunSetup) {
  const jobApp = createJobAppClient({ baseUrl: fake.url, username: fake.username, password: fake.password, envPath: 'env' })
  const httpFor = () => http ?? { dayEnded: false, get: async () => ({ kind: 'gone' as const }) }
  return runFetch({ jobApp, connectors, sources, state, today: '2026-11-23', httpFor })
}

test('requested mode fetches only the clicked ads, oldest first', async () => {
  fake.ads.push(waiting(1, clicked), waiting(2, promising), waiting(3, { ...clicked, ...notPromising }))

  const report = await run({ connectors: [connector('duuni')], sources: { duuni: config('requested') } })

  expect(fetched).toEqual(['https://duuni.example/1', 'https://duuni.example/3'])
  expect(report.duuni.ready).toBe(2)
  expect(fake.ads.map((ad) => ad.state)).toEqual(['ready', 'awaiting_handover', 'ready'])
})

test('automatic mode adds the promising ones, never the not-promising ones', async () => {
  fake.ads.push(waiting(1, promising), waiting(2, notPromising), waiting(3), waiting(4, { ...clicked, ...notPromising }))

  await run({ connectors: [connector('duuni')], sources: { duuni: config('automatic') } })

  expect(fetched).toEqual(['https://duuni.example/1', 'https://duuni.example/4'])
})

test('ads of other sources and states are left alone', async () => {
  fake.ads.push(waiting(1, { ...clicked, source: 'other' }), waiting(2, { ...clicked, state: 'ready' }))

  const report = await run({ connectors: [connector('duuni')], sources: { duuni: config('requested') } })

  expect(fetched).toEqual([])
  expect(report.duuni.ready).toBe(0)
})

test('it stops once the day has ended', async () => {
  fake.ads.push(waiting(1, clicked), waiting(2, clicked))
  const http = { dayEnded: false, get: async () => ({ kind: 'gone' as const }) }
  const blocking = connector('duuni', [{ kind: 'blocked' }])
  const fetchAd = blocking.fetchAd!
  blocking.fetchAd = async (candidate, polite) => {
    http.dayEnded = true
    return fetchAd(candidate, polite)
  }

  const report = await run({ connectors: [blocking], sources: { duuni: config('requested') }, http })

  expect(fetched).toEqual(['https://duuni.example/1'])
  expect(report.duuni.blocked).toBe(1)
  expect(state.readFailures()).toEqual([{ source: 'duuni', date: '2026-11-23', kind: 'blocked' }])
  expect(fake.transitions).toEqual([])
})

test('gone fails the ad, and another failure is a same-state attempt', async () => {
  fake.ads.push(waiting(1, clicked), waiting(2, clicked))

  const results: FetchResult[] = [{ kind: 'gone' }, { kind: 'failed', category: 'network' }]
  const report = await run({ connectors: [connector('duuni', results)], sources: { duuni: config('requested') } })

  expect(report.duuni).toMatchObject({ gone: 1, retrying: 1 })
  expect(fake.transitions).toEqual([
    { id: 1, to: 'failed', error: 'gone' },
    { id: 2, to: 'awaiting_handover', error: 'network' },
  ])
})

test('a connector without fetchAd and a disabled one are skipped', async () => {
  fake.ads.push(waiting(1, clicked), waiting(2, { ...clicked, source: 'off' }))
  const { fetchAd: _fetchAd, ...pasteOnly } = connector('duuni')
  const disabled = connector('off')

  const report = await run({
    connectors: [pasteOnly, disabled],
    sources: { duuni: config('requested'), off: { ...config('requested'), enabled: false } },
  })

  expect(fetched).toEqual([])
  expect(report).toEqual({})
})

describe('an automatic source', () => {
  const automatic = (results: FetchResult[] = []) => ({ ...connector('auto', results), mode: 'automatic' as const })
  const fresh = (id: number, fields: Partial<FakeAd> = {}) =>
    fakeAd({ id, source: 'auto', sourceMode: 'automatic', state: 'new', url: `https://auto.example/${id}`, ...fields })

  test('fetches its promising new ads, and not the unscreened or not-promising ones', async () => {
    fake.ads.push(fresh(1, promising), fresh(2), fresh(3, notPromising))

    const report = await run({ connectors: [automatic()], sources: { auto: config('automatic') } })

    expect(fetched).toEqual(['https://auto.example/1'])
    expect(report.auto.ready).toBe(1)
    expect(fake.ads.map((ad) => ad.state)).toEqual(['ready', 'new', 'new'])
  })

  test('a failure is a same-state attempt in new', async () => {
    fake.ads.push(fresh(1, promising))

    const failing = automatic([{ kind: 'failed', category: 'network' }])

    await run({ connectors: [failing], sources: { auto: config('automatic') } })

    expect(fake.transitions).toEqual([{ id: 1, to: 'new', error: 'network' }])
  })
})
