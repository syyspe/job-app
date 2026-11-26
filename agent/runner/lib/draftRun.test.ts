// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { startFakeJobApp } from '../../test/fakeJobApp.ts'
import type { FakeJobApp } from '../../test/fakeJobApp.ts'
import { fakeAd } from '../../test/fakeJobAppAds.ts'
import type { HealthResult } from '../../profile/lib/ollama.ts'
import type { DraftOutcome } from './draft.ts'
import { runDrafting } from './draftRun.ts'
import { createJobAppClient } from './jobApp.ts'
import type { Ad } from './jobApp.ts'

let fake: FakeJobApp

beforeEach(async () => {
  fake = await startFakeJobApp()
})

afterEach(async () => {
  await fake.close()
})

const written: DraftOutcome = {
  kind: 'written',
  output: {
    language: 'en',
    applicationType: 'portal',
    company: '',
    role: '',
    applyTo: '',
    fitSummary: 'Fits.',
    coverLetter: 'Because [[ASK:q1]].',
    cv: 'CV',
    questions: [{ id: 'q1', text: 'Why?' }],
  },
}

interface RunOverrides {
  health?: HealthResult
  write?: (ad: Ad) => Promise<DraftOutcome>
  perRunCap?: number
  concurrency?: number
  canStart?: () => boolean
}

function run(overrides: RunOverrides = {}) {
  const jobApp = createJobAppClient({ baseUrl: fake.url, username: fake.username, password: fake.password, envPath: 'env' })
  const config = {
    concurrency: overrides.concurrency ?? 1,
    perRunCap: overrides.perRunCap ?? 3,
    timeoutMs: 1000,
    filePrefix: 'Tester',
    cvTemplates: { fi: '/cv/fi.md', en: '/cv/en.md' },
  }
  return runDrafting({
    jobApp,
    config,
    checkHealth: () => Promise.resolve(overrides.health ?? { ok: true }),
    canStart: overrides.canStart,
    write: overrides.write ?? (() => Promise.resolve(written)),
    today: '2026-11-19',
  })
}

function suitableAds(...ids: number[]) {
  fake.ads.push(...ids.map((id) => fakeAd({ id, state: 'suitable', body: 'Ad text' })))
}

test('Ollama down: skipped, nothing moved', async () => {
  suitableAds(1)

  const report = await run({ health: { ok: false, reason: 'unreachable' } })

  expect(report.skipped).toBe('unreachable')
  expect(fake.drafts).toEqual([])
  expect(fake.transitions).toEqual([])
})

test('a written draft is posted with its fields and files', async () => {
  suitableAds(1)

  const report = await run()

  expect(report.counts).toEqual({ drafted: 1, retrying: 0, failed: 0 })
  expect(fake.drafts).toHaveLength(1)
  expect(fake.drafts[0].fields).toMatchObject({ company: 'Example Oy', role: 'Developer 1', link: 'https://jobs.example/1' })
  expect(Object.keys(fake.drafts[0].files)).toEqual(['coverLetter', 'cv', 'ad'])
  expect(fake.ads[0].state).toBe('drafted')
})

test('the cap drafts the oldest ads and leaves the rest suitable', async () => {
  suitableAds(1, 2, 3)

  const report = await run({ perRunCap: 2 })

  expect(report.queued).toBe(1)
  expect(fake.ads.map((ad) => ad.state)).toEqual(['drafted', 'drafted', 'suitable'])
})

test('the concurrency limit is never exceeded', async () => {
  suitableAds(1, 2, 3, 4)
  let inFlight = 0
  let peak = 0
  async function write(): Promise<DraftOutcome> {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    await new Promise((resolve) => setTimeout(resolve, 20))
    inFlight -= 1
    return written
  }

  await run({ write, concurrency: 2, perRunCap: 4 })

  expect(peak).toBe(2)
})

test('a failure records a same-state attempt, and the others still run', async () => {
  suitableAds(1, 2)
  const write = (ad: Ad): Promise<DraftOutcome> =>
    Promise.resolve(ad.id === 1 ? { kind: 'failed', category: 'ask_mismatch' } : written)

  const report = await run({ write })

  expect(fake.transitions).toEqual([{ id: 1, to: 'suitable', error: 'ask_mismatch' }])
  expect(fake.ads[0]).toMatchObject({ state: 'suitable', attempts: 1 })
  expect(fake.ads[1].state).toBe('drafted')
  expect(report.counts).toEqual({ drafted: 1, retrying: 1, failed: 0 })
})

test('the third failure is counted as failed', async () => {
  fake.ads.push(fakeAd({ id: 1, state: 'suitable', body: 'Ad text', attempts: 2 }))

  const report = await run({ write: () => Promise.resolve({ kind: 'failed', category: 'timeout' }) })

  expect(report.counts.failed).toBe(1)
  expect(fake.ads[0].state).toBe('failed')
})

test('no request ever touches the applications routes', async () => {
  suitableAds(1, 2)
  const write = (ad: Ad): Promise<DraftOutcome> =>
    Promise.resolve(ad.id === 1 ? { kind: 'failed', category: 'cli_failed' } : written)

  await run({ write })

  expect(fake.requests.filter((request) => request.includes('/api/applications'))).toEqual([])
})

test('once canStart turns false no further ad is drafted, and the rest stay queued with no attempt', async () => {
  fake.ads.push(fakeAd({ id: 1, state: 'suitable' }), fakeAd({ id: 2, state: 'suitable' }))
  const seen: number[] = []

  const report = await run({ canStart: () => seen.length < 1, write: async (ad) => (seen.push(ad.id), written) })

  expect(seen).toEqual([1])
  expect(report.counts).toEqual({ drafted: 1, retrying: 0, failed: 0 })
  expect(report.queued).toBe(1)
  expect(fake.ads.map((ad) => [ad.state, ad.attempts])).toEqual([['drafted', 0], ['suitable', 0]])
})
