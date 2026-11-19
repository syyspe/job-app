// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { UNREACHABLE_URL } from '../../test/fakeOllama.ts'
import { startFakeJobApp } from '../../test/fakeJobApp.ts'
import { fakeAd } from '../../test/fakeJobAppAds.ts'
import type { FakeJobApp } from '../../test/fakeJobApp.ts'
import { createJobAppClient } from './jobApp.ts'

let fake: FakeJobApp

beforeEach(async () => {
  fake = await startFakeJobApp([
    { id: 3, originalName: 'letter.md', content: 'Dear team', pending: true },
    { id: 4, originalName: 'cv.md', content: 'CV', pending: false },
  ])
})

afterEach(async () => {
  await fake.close()
})

function client(overrides: { baseUrl?: string; password?: string } = {}) {
  return createJobAppClient({
    baseUrl: fake.url,
    username: fake.username,
    password: fake.password,
    envPath: '/home/u/.config/job-agent/env',
    ...overrides,
  })
}

test('lists the pending attachments, downloads one and clears its flag', async () => {
  const jobApp = client()

  expect(await jobApp.listPendingSync()).toEqual([{ id: 3, originalName: 'letter.md' }])
  expect(new TextDecoder().decode(await jobApp.downloadAttachment(3))).toBe('Dear team')
  await jobApp.setProfileSync(3, false)

  expect(fake.flagCalls).toEqual([{ id: 3, pending: false }])
  expect(fake.logins).toBe(1)
})

test('an expired session logs in again once and retries', async () => {
  const jobApp = client()
  await jobApp.listPendingSync()
  fake.expireSession()

  expect(await jobApp.listPendingSync()).toHaveLength(1)
  expect(fake.logins).toBe(2)
})

test('a rejected login names the env file, not the password', async () => {
  const failing = client({ password: 'wrong-secret' }).listPendingSync()

  await expect(failing).rejects.toMatchObject({
    exitCode: 1,
    message: 'job-app login failed: check JOBAPP_USERNAME and JOBAPP_PASSWORD in /home/u/.config/job-agent/env',
  })
})

test('an unreachable job-app names its URL', async () => {
  await expect(client({ baseUrl: UNREACHABLE_URL }).listPendingSync()).rejects.toMatchObject({
    exitCode: 1,
    message: `cannot reach job-app at ${UNREACHABLE_URL}`,
  })
})

test('a failing response passes the API error through', async () => {
  fake.failure = 'status'

  await expect(client().listPendingSync()).rejects.toMatchObject({
    exitCode: 1,
    message: 'job-app GET /api/attachments/pending-sync: 500 internal server error',
  })
})

test('an unknown attachment is a 404 naming the request', async () => {
  await expect(client().setProfileSync(99, false)).rejects.toMatchObject({
    exitCode: 1,
    message: 'job-app PUT /api/attachments/99/profile-sync: 404 not found',
  })
})

test('lists ads by state, reads one with its body and transitions it', async () => {
  fake.ads.push(fakeAd({ id: 1, state: 'ready', body: 'Full text' }), fakeAd({ id: 2, state: 'new' }))
  const jobApp = client()

  expect((await jobApp.listAds('ready')).map((ad) => ad.id)).toEqual([1])
  expect((await jobApp.getAd(1)).body).toBe('Full text')
  const moved = await jobApp.transitionAd(1, { to: 'ready', error: 'timeout' })

  expect(moved).toMatchObject({ id: 1, state: 'ready', attempts: 1 })
  expect(fake.transitions).toEqual([{ id: 1, to: 'ready', error: 'timeout' }])
})

test('an ad list that is not a list is a bad response', async () => {
  fake.failure = 'malformed'

  await expect(client().listAds('new')).rejects.toMatchObject({
    exitCode: 1,
    message: 'job-app GET /api/ads?state=new: bad response',
  })
})

test('an unknown ad passes the 404 through', async () => {
  await expect(client().getAd(99)).rejects.toMatchObject({
    exitCode: 1,
    message: 'job-app GET /api/ads/99: 404 ad not found',
  })
})
