// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { startFakeJobApp } from '../../test/fakeJobApp.ts'
import type { FakeJobApp } from '../../test/fakeJobApp.ts'
import { fakeAd } from '../../test/fakeJobAppAds.ts'
import { createJobAppClient } from './jobApp.ts'
import type { AdSummary } from './jobApp.ts'
import type { PrescreenOutcome } from './prescreen.ts'
import { formatPrescreenReport, runPrescreen } from './prescreenRun.ts'

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

test('only unscreened hand-over ads in awaiting_handover are pre-screened, oldest first', async () => {
  fake.ads.push(
    fakeAd({ id: 1, ...waiting }),
    fakeAd({ id: 2, ...waiting }),
    fakeAd({ id: 3, ...waiting, prescreen: { verdict: 'promising', reason: 'Done.' } }),
    fakeAd({ id: 4, state: 'awaiting_handover', sourceMode: 'automatic' }),
    fakeAd({ id: 5, state: 'ready', sourceMode: 'handover' }),
  )

  const report = await run(verdictFor)

  expect(seen).toEqual([1, 2])
  expect(fake.prescreens).toEqual([
    { id: 1, prescreen: { verdict: 'promising', reason: 'Ad 1.' } },
    { id: 2, prescreen: { verdict: 'not_promising', reason: 'Ad 2.' } },
  ])
  expect(report).toMatchObject({ screened: { promising: 1, notPromising: 1 }, failed: 0, queued: 0 })
  expect(report.ads.map((ad) => ad.id)).toEqual([1, 2])
})

test('the cap leaves the newest queued', async () => {
  fake.ads.push(fakeAd({ id: 1, ...waiting }), fakeAd({ id: 2, ...waiting }), fakeAd({ id: 3, ...waiting }))

  const report = await run(verdictFor, 2)

  expect(seen).toEqual([1, 2])
  expect(report.queued).toBe(1)
})

test.each(['timeout', 'cli_failed', 'bad_output', 'invalid_result'] as const)(
  'a %s failure posts nothing and is counted',
  async (category) => {
    fake.ads.push(fakeAd({ id: 1, ...waiting }))

    const report = await run(() => ({ kind: 'failed', category }))

    expect(fake.prescreens).toEqual([])
    expect(fake.transitions).toEqual([])
    expect(report).toMatchObject({ screened: { promising: 0, notPromising: 0 }, failed: 1, ads: [] })
  },
)

test('the report prints one line for verdicts and one for the queue', () => {
  const report = { screened: { promising: 2, notPromising: 1 }, failed: 1, queued: 3, ads: [] }

  expect(formatPrescreenReport(report)).toEqual([
    'pre-screened: 2 promising, 1 not promising, 1 failed',
    'queued: 3 ads over the pre-screen cap',
  ])
})

test('once canStart turns false no further ad is pre-screened, and the rest stay queued', async () => {
  fake.ads.push(fakeAd({ id: 1, ...waiting }), fakeAd({ id: 2, ...waiting }), fakeAd({ id: 3, ...waiting }))

  const report = await run(verdictFor, 10, () => seen.length < 1)

  expect(seen).toEqual([1])
  expect(report.screened).toEqual({ promising: 1, notPromising: 0 })
  expect(report.failed).toBe(0)
  expect(report.queued).toBe(2)
  expect(fake.ads.map((ad) => ad.prescreen === null)).toEqual([false, true, true])
})
