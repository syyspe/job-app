// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { startFakeJobApp } from '../../test/fakeJobApp.ts'
import type { FakeJobApp } from '../../test/fakeJobApp.ts'
import { fakeAd } from '../../test/fakeJobAppAds.ts'
import type { HealthResult } from '../../profile/lib/ollama.ts'
import type { EvaluationOutcome } from './evaluate.ts'
import { createJobAppClient } from './jobApp.ts'
import type { Ad } from './jobApp.ts'
import { runEvaluation } from './evaluationRun.ts'

let fake: FakeJobApp

beforeEach(async () => {
  fake = await startFakeJobApp()
})

afterEach(async () => {
  await fake.close()
})

const suitable: EvaluationOutcome = {
  kind: 'evaluated',
  transition: { to: 'suitable', evaluation: { verdict: 'suitable', fitSummary: 'Fits.', reasons: [] } },
}

interface RunOverrides {
  health?: HealthResult
  evaluate?: (ad: Ad) => Promise<EvaluationOutcome>
  perRunCap?: number
  concurrency?: number
  canStart?: () => boolean
}

function run(overrides: RunOverrides = {}) {
  const jobApp = createJobAppClient({ baseUrl: fake.url, username: fake.username, password: fake.password, envPath: 'env' })
  const config = {
    titleRules: { reject: ['trainee'] },
    evaluation: { concurrency: overrides.concurrency ?? 2, perRunCap: overrides.perRunCap ?? 10, timeoutMs: 1000 },
  }
  return runEvaluation({
    jobApp,
    config,
    checkHealth: () => Promise.resolve(overrides.health ?? { ok: true }),
    canStart: overrides.canStart,
    evaluate: overrides.evaluate ?? (() => Promise.resolve(suitable)),
  })
}

test('screening moves new ads by title and mode, leaving passing automatic ads new', async () => {
  fake.ads.push(
    fakeAd({ id: 1, title: 'Trainee developer', sourceMode: 'automatic' }),
    fakeAd({ id: 2, title: 'Trainee developer', sourceMode: 'handover' }),
    fakeAd({ id: 3, title: 'Backend developer', sourceMode: 'handover' }),
    fakeAd({ id: 4, title: 'Backend developer', sourceMode: 'automatic' }),
  )

  const report = await run()

  expect(report.screened).toEqual({ titleRejected: 2, awaitingHandover: 1, leftNew: 1 })
  expect(fake.ads.map((ad) => ad.state)).toEqual(['title_rejected', 'title_rejected', 'awaiting_handover', 'new'])
})

test('Ollama down: screening still runs, but no ready ad is touched', async () => {
  fake.ads.push(fakeAd({ id: 1, title: 'Trainee' }), fakeAd({ id: 2, state: 'ready', body: 'text' }))

  const report = await run({ health: { ok: false, reason: 'unreachable' } })

  expect(report.skipped).toBe('unreachable')
  expect(fake.transitions).toEqual([{ id: 1, to: 'title_rejected' }])
  expect(fake.ads[1]).toMatchObject({ state: 'ready', attempts: 0 })
})

test('the cap evaluates the oldest ads and leaves the rest ready', async () => {
  fake.ads.push(...[1, 2, 3].map((id) => fakeAd({ id, state: 'ready', body: 'text' })))

  const report = await run({ perRunCap: 2 })

  expect(report.queued).toBe(1)
  expect(report.evaluated.suitable).toBe(2)
  expect(fake.ads.map((ad) => ad.state)).toEqual(['suitable', 'suitable', 'ready'])
})

test('the concurrency limit is never exceeded', async () => {
  fake.ads.push(...[1, 2, 3, 4, 5].map((id) => fakeAd({ id, state: 'ready', body: 'text' })))
  let inFlight = 0
  let peak = 0
  async function evaluate(): Promise<EvaluationOutcome> {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    await new Promise((resolve) => setTimeout(resolve, 20))
    inFlight -= 1
    return suitable
  }

  await run({ evaluate, concurrency: 2 })

  expect(peak).toBe(2)
})

test('a failure records an attempt with its category, and the others still run', async () => {
  fake.ads.push(fakeAd({ id: 1, state: 'ready', body: 'text' }), fakeAd({ id: 2, state: 'ready', body: 'text' }))
  const evaluate = (ad: Ad): Promise<EvaluationOutcome> =>
    Promise.resolve(ad.id === 1 ? { kind: 'failed', category: 'timeout' } : suitable)

  const report = await run({ evaluate })

  expect(fake.transitions).toContainEqual({ id: 1, to: 'ready', error: 'timeout' })
  expect(fake.ads[0]).toMatchObject({ state: 'ready', attempts: 1, lastError: 'timeout' })
  expect(fake.ads[1].state).toBe('suitable')
  expect(report.evaluated).toEqual({ suitable: 1, unsuitable: 0, retrying: 1, failed: 0 })
})

test('the third failure is counted as failed', async () => {
  fake.ads.push(fakeAd({ id: 1, state: 'ready', body: 'text', attempts: 2 }))

  const report = await run({ evaluate: () => Promise.resolve({ kind: 'failed', category: 'bad_output' }) })

  expect(report.evaluated.failed).toBe(1)
  expect(fake.ads[0].state).toBe('failed')
})

test('the evaluated ad carries its body', async () => {
  fake.ads.push(fakeAd({ id: 1, state: 'ready', body: 'Full ad text' }))
  const bodies: (string | null)[] = []

  await run({ evaluate: (ad) => (bodies.push(ad.body), Promise.resolve(suitable)) })

  expect(bodies).toEqual(['Full ad text'])
})

test('once canStart turns false no further ad is evaluated, and the rest stay queued with no attempt', async () => {
  fake.ads.push(fakeAd({ id: 1, state: 'ready' }), fakeAd({ id: 2, state: 'ready' }), fakeAd({ id: 3, state: 'ready' }))
  const seen: number[] = []

  const report = await run({
    concurrency: 1,
    canStart: () => seen.length < 1,
    evaluate: async (ad) => (seen.push(ad.id), suitable),
  })

  expect(seen).toEqual([1])
  expect(report.evaluated).toEqual({ suitable: 1, unsuitable: 0, retrying: 0, failed: 0 })
  expect(report.queued).toBe(2)
  expect(fake.ads.map((ad) => [ad.state, ad.attempts])).toEqual([['suitable', 0], ['ready', 0], ['ready', 0]])
})
