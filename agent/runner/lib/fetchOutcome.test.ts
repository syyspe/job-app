// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { startFakeJobApp } from '../../test/fakeJobApp.ts'
import type { FakeJobApp } from '../../test/fakeJobApp.ts'
import { fakeAd } from '../../test/fakeJobAppAds.ts'
import { makeTempDir } from '../../test/tempDir.ts'
import type { TempDir } from '../../test/tempDir.ts'
import { applyFetch, recordBlocked } from './fetchOutcome.ts'
import { createJobAppClient } from './jobApp.ts'
import type { JobAppClient } from './jobApp.ts'
import { createRunnerState } from './state.ts'

let fake: FakeJobApp
let jobApp: JobAppClient

beforeEach(async () => {
  fake = await startFakeJobApp()
  const { url: baseUrl, username, password } = fake
  jobApp = createJobAppClient({ baseUrl, username, password, envPath: '/env' })
})

afterEach(async () => {
  await fake.close()
})

async function waitingAd() {
  fake.ads.push(fakeAd({ id: 1, sourceMode: 'handover', state: 'awaiting_handover' }))
  const [ad] = await jobApp.listAds('awaiting_handover')
  return ad
}

test('a failure from awaiting_handover is a same-state attempt', async () => {
  const ad = await waitingAd()

  expect(await applyFetch(jobApp, ad, { kind: 'failed', category: 'network' })).toBe('retrying')
  expect(fake.transitions).toEqual([{ id: 1, to: 'awaiting_handover', error: 'network' }])
})

test('the third failure is failed', async () => {
  const ad = await waitingAd()
  fake.ads[0].attempts = 2

  expect(await applyFetch(jobApp, ad, { kind: 'failed', category: 'network' })).toBe('failed')
})

test('a page moves the ad to ready with what it names', async () => {
  const ad = await waitingAd()

  expect(await applyFetch(jobApp, ad, { kind: 'ok', text: 'The ad.', deadline: '2026-12-02' })).toBe('ready')
  expect(fake.transitions).toEqual([{ id: 1, to: 'ready', body: 'The ad.', deadline: '2026-12-02' }])
})

test('gone fails the ad, and a block moves nothing', async () => {
  const ad = await waitingAd()

  expect(await applyFetch(jobApp, ad, { kind: 'blocked' })).toBe('blocked')
  expect(fake.transitions).toEqual([])
  expect(await applyFetch(jobApp, ad, { kind: 'gone' })).toBe('gone')
  expect(fake.transitions).toEqual([{ id: 1, to: 'failed', error: 'gone' }])
})

test('a block is recorded once per source and day', () => {
  const dir: TempDir = makeTempDir()
  const state = createRunnerState(dir.root)

  recordBlocked(state, 'duunitori', '2026-11-23')
  recordBlocked(state, 'duunitori', '2026-11-23')

  expect(state.readFailures()).toEqual([{ source: 'duunitori', date: '2026-11-23', kind: 'blocked' }])
  dir.remove()
})
