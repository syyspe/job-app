// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { startFakeJobApp } from '../../test/fakeJobApp.ts'
import type { FakeJobApp } from '../../test/fakeJobApp.ts'
import { fakeAd } from '../../test/fakeJobAppAds.ts'
import { dismissExpiredHandovers, handoverExpired } from './handoverExpiry.ts'
import { createJobAppClient } from './jobApp.ts'

const waitDays = 7

function ad(firstSeenAt: string, deadline = '') {
  return { firstSeenAt, deadline }
}

test('an ad inside its wait is kept, and expires once the wait has passed in UTC', () => {
  const seen = ad('2026-11-10 22:30:00')

  expect(handoverExpired(seen, { waitDays, now: new Date('2026-11-17T22:29:59Z') })).toBe(false)
  expect(handoverExpired(seen, { waitDays, now: new Date('2026-11-17T22:30:00Z') })).toBe(true)
})

test('a deadline expires the ad once the local date is past it, not during the day', () => {
  const seen = ad('2026-11-18 08:00:00', '2026-11-19')

  expect(handoverExpired(seen, { waitDays, now: new Date(2026, 10, 19, 23, 59) })).toBe(false)
  expect(handoverExpired(seen, { waitDays, now: new Date(2026, 10, 20, 0, 0) })).toBe(true)
})

test('a deadline that is not an ISO date is ignored', () => {
  const seen = ad('2026-11-18 08:00:00', '19.11.2026')

  expect(handoverExpired(seen, { waitDays, now: new Date(2026, 10, 21) })).toBe(false)
})

let fake: FakeJobApp

beforeEach(async () => {
  fake = await startFakeJobApp()
})

afterEach(async () => {
  await fake.close()
})

test('only the expired hand-overs are dismissed, and they are counted', async () => {
  fake.ads.push(
    fakeAd({ id: 1, state: 'awaiting_handover', sourceMode: 'handover', firstSeenAt: '2026-11-01 08:00:00' }),
    fakeAd({ id: 2, state: 'awaiting_handover', sourceMode: 'handover', firstSeenAt: '2026-11-19 08:00:00', deadline: '2026-11-19' }),
    fakeAd({ id: 3, state: 'awaiting_handover', sourceMode: 'handover', firstSeenAt: '2026-11-19 08:00:00', deadline: '2026-11-30' }),
  )
  const jobApp = createJobAppClient({ baseUrl: fake.url, username: fake.username, password: fake.password, envPath: 'env' })

  const dismissed = await dismissExpiredHandovers(jobApp, { waitDays, now: new Date(2026, 10, 20, 20, 0) })

  expect(dismissed).toBe(2)
  expect(fake.transitions).toEqual([
    { id: 2, to: 'dismissed' },
    { id: 1, to: 'dismissed' },
  ])
  expect(fake.ads[2].state).toBe('awaiting_handover')
})
