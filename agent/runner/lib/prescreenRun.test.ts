// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { startFakeJobApp } from '../../test/fakeJobApp.ts'
import type { FakeJobApp } from '../../test/fakeJobApp.ts'
import { fakeAd } from '../../test/fakeJobAppAds.ts'
import { createJobAppClient } from './jobApp.ts'
import type { AdSummary } from './jobApp.ts'
import type { PrescreenOutcome } from './prescreen.ts'
import { runPrescreen } from './prescreenRun.ts'

let fake: FakeJobApp
let seen: number[]

beforeEach(async () => {
  fake = await startFakeJobApp()
  seen = []
})

afterEach(async () => {
  await fake.close()
})

const waiting = { state: 'awaiting_handover', sourceMode: 'handover' as const }
const fresh = { state: 'new', sourceMode: 'automatic' as const }

function run(outcome: (ad: AdSummary) => PrescreenOutcome, perRunCap = 10, canStart?: () => boolean) {
  const jobApp = createJobAppClient({ baseUrl: fake.url, username: fake.username, password: fake.password, envPath: 'env' })
  return runPrescreen({
    jobApp,
    config: { concurrency: 2, perRunCap, timeoutMs: 1000 },
    prescreen: async (ad) => (seen.push(ad.id), outcome(ad)),
    canStart,
  })
}

const verdictFor = (ad: AdSummary): PrescreenOutcome => ({
  kind: 'screened',
  prescreen: { verdict: ad.id === 1 ? 'promising' : 'not_promising', reason: `Ad ${ad.id}.` },
})

test('unscreened hand-over ads awaiting hand-over and new automatic ads are pre-screened, oldest first', async () => {
  fake.ads.push(
    fakeAd({ id: 1, ...waiting }),
    fakeAd({ id: 2, ...fresh }),
    fakeAd({ id: 3, ...waiting, prescreen: { verdict: 'promising', reason: 'Done.' } }),
    fakeAd({ id: 4, state: 'awaiting_handover', sourceMode: 'automatic' }),
    fakeAd({ id: 5, state: 'ready', sourceMode: 'handover' }),
    fakeAd({ id: 6, ...waiting }),
    fakeAd({ id: 7, state: 'new', sourceMode: 'handover' }),
  )

  const report = await run(verdictFor)

  expect(seen).toEqual([1, 2, 6])
  expect(fake.prescreens.map((posted) => posted.id).sort()).toEqual([1, 2, 6])
  expect(report).toMatchObject({ failed: 0, queued: 0 })
  expect(report.promising.map((ad) => ad.id)).toEqual([1])
  expect(report.setAside.map((ad) => [ad.id, ad.prescreen?.reason])).toEqual([
    [2, 'Ad 2.'],
    [6, 'Ad 6.'],
  ])
})

test('a not-promising ad is dismissed at once, a promising one stays where it was', async () => {
  fake.ads.push(fakeAd({ id: 1, ...fresh }), fakeAd({ id: 2, ...fresh }), fakeAd({ id: 3, ...waiting }))

  await run(verdictFor)

  expect(fake.transitions.toSorted((a, b) => a.id - b.id)).toEqual([
    { id: 2, to: 'dismissed' },
    { id: 3, to: 'dismissed' },
  ])
  expect(fake.ads.map((ad) => ad.state)).toEqual(['new', 'dismissed', 'dismissed'])
  expect(fake.ads[1].prescreen).toEqual({ verdict: 'not_promising', reason: 'Ad 2.' })
})

test('a failed dismissal ends the step with the verdict kept', async () => {
  fake.ads.push(fakeAd({ id: 2, ...fresh }))
  fake.transitionFailsFor = 2

  await expect(run(verdictFor)).rejects.toMatchObject({ exitCode: 1 })
  expect(fake.ads[0]).toMatchObject({ state: 'new', prescreen: { verdict: 'not_promising' } })
})

test('the cap leaves the newest queued', async () => {
  fake.ads.push(fakeAd({ id: 1, ...waiting }), fakeAd({ id: 2, ...waiting }), fakeAd({ id: 3, ...waiting }))

  const report = await run(verdictFor, 2)

  expect(seen).toEqual([1, 2])
  expect(report.queued).toBe(1)
})

test.each(['timeout', 'model_failed', 'bad_output', 'invalid_result'] as const)(
  'a %s failure posts nothing and is counted',
  async (category) => {
    fake.ads.push(fakeAd({ id: 1, ...waiting }))

    const report = await run(() => ({ kind: 'failed', category }))

    expect(fake.prescreens).toEqual([])
    expect(fake.transitions).toEqual([])
    expect(report).toMatchObject({ promising: [], setAside: [], failed: 1 })
  },
)

test('once canStart turns false no further ad is pre-screened, and the rest stay queued', async () => {
  fake.ads.push(fakeAd({ id: 1, ...waiting }), fakeAd({ id: 2, ...waiting }), fakeAd({ id: 3, ...waiting }))

  const report = await run(verdictFor, 10, () => seen.length < 1)

  expect(seen).toEqual([1])
  expect(report.promising.map((ad) => ad.id)).toEqual([1])
  expect(report.failed).toBe(0)
  expect(report.queued).toBe(2)
  expect(fake.ads.map((ad) => ad.prescreen === null)).toEqual([false, true, true])
})

test('a failed pre-screen is reported with its ad and detail', async () => {
  fake.ads.push(fakeAd({ id: 1, ...waiting }), fakeAd({ id: 2, ...waiting }))

  const report = await run((ad) =>
    ad.id === 1 ? { kind: 'failed', category: 'model_failed', detail: 'no response: reset' } : verdictFor(ad),
  )

  expect(report.failedAttempts).toEqual([
    { adId: 1, title: 'Developer 1', source: 'testsource', category: 'model_failed', detail: 'no response: reset' },
  ])
})
