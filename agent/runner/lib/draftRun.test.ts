// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { startFakeJobApp } from '../../test/fakeJobApp.ts'
import type { FakeJobApp } from '../../test/fakeJobApp.ts'
import { fakeAd } from '../../test/fakeJobAppAds.ts'
import type { HealthResult } from '../../profile/lib/ollama.ts'
import type { DraftOutcome } from './draft.ts'
import { draftNamedAd, formatDraftReport } from './draftRun.ts'
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
}

function run(adId: number, overrides: RunOverrides = {}) {
  const jobApp = createJobAppClient({ baseUrl: fake.url, username: fake.username, password: fake.password, envPath: 'env' })
  const config = { timeoutMs: 1000, filePrefix: 'Tester', cvTemplates: { fi: '/cv/fi.md', en: '/cv/en.md' } }
  return draftNamedAd(
    {
      jobApp,
      config,
      checkHealth: () => Promise.resolve(overrides.health ?? { ok: true }),
      write: overrides.write ?? (() => Promise.resolve(written)),
      today: '2026-11-19',
    },
    adId,
  )
}

function suitableAds(...ids: number[]) {
  fake.ads.push(...ids.map((id) => fakeAd({ id, state: 'suitable', body: 'Ad text' })))
}

test('Ollama down throws skipped, and no ad is touched', async () => {
  suitableAds(1)

  await expect(run(1, { health: { ok: false, reason: 'unreachable' } })).rejects.toThrow('drafting skipped: unreachable')

  expect(fake.drafts).toEqual([])
  expect(fake.transitions).toEqual([])
})

test('an ad that is not suitable throws, and is not touched', async () => {
  fake.ads.push(fakeAd({ id: 1, state: 'drafted', body: 'Ad text' }))
  const write = vi.fn(() => Promise.resolve(written))

  await expect(run(1, { write })).rejects.toThrow('ad 1 is drafted, not suitable')

  expect(write).not.toHaveBeenCalled()
  expect(fake.transitions).toEqual([])
})

test('a written draft of the named ad is posted with its fields and files', async () => {
  suitableAds(1, 2)

  const report = await run(2)

  expect(report).toEqual({ result: 'drafted', adId: 2, applicationId: 101 })
  expect(formatDraftReport(report)).toBe('drafted: ad 2 as application 101')
  expect(fake.drafts).toHaveLength(1)
  expect(fake.drafts[0].fields).toMatchObject({ company: 'Example Oy', role: 'Developer 2', link: 'https://jobs.example/2' })
  expect(Object.keys(fake.drafts[0].files)).toEqual(['coverLetter', 'cv', 'ad'])
  expect(fake.ads.map((ad) => ad.state)).toEqual(['suitable', 'drafted'])
})

test('a failure records a same-state attempt and reports it retrying', async () => {
  suitableAds(1)
  const write = (): Promise<DraftOutcome> =>
    Promise.resolve({ kind: 'failed', category: 'model_failed', detail: '500: overloaded' })

  const report = await run(1, { write })

  expect(fake.transitions).toEqual([{ id: 1, to: 'suitable', error: 'model_failed' }])
  expect(fake.ads[0]).toMatchObject({ state: 'suitable', attempts: 1 })
  expect(formatDraftReport(report)).toBe('drafting failed: Developer 1, testsource: model_failed — 500: overloaded (retrying)')
})

test('the third failure fails the ad and reports it failed', async () => {
  fake.ads.push(fakeAd({ id: 1, state: 'suitable', body: 'Ad text', attempts: 2 }))

  const report = await run(1, { write: () => Promise.resolve({ kind: 'failed', category: 'timeout' }) })

  expect(report.result).toBe('failed')
  expect(fake.ads[0].state).toBe('failed')
  expect(formatDraftReport(report)).toBe('drafting failed: Developer 1, testsource: timeout (failed)')
})

test('no request ever touches the applications routes', async () => {
  suitableAds(1)

  await run(1)

  expect(fake.requests.filter((request) => request.includes('/api/applications'))).toEqual([])
})
