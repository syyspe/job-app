// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { db, ingest, moved, otherCookie, post, readAd, readyAd, transition, withAdsApi } from '../test/adsApi.ts'
import type { Ad } from '../types.ts'

withAdsApi()

async function waiting(): Promise<Ad> {
  const ad = await ingest({ sourceMode: 'handover' })
  return moved(ad.id, { to: 'awaiting_handover' })
}

function prescreen(id: number, body: unknown, sessionCookie?: string): Promise<Response> {
  return post(`/ads/${id}/prescreen`, body, sessionCookie)
}

const PROMISING = { verdict: 'promising', reason: 'The title names test automation.' }

describe('fetch request', () => {
  test('marks a waiting hand-over ad and keeps it waiting', async () => {
    const ad = await waiting()

    const res = await post(`/ads/${ad.id}/fetch-request`, undefined)

    expect(res.status).toBe(200)
    const result = (await res.json()) as Ad
    expect(result.state).toBe('awaiting_handover')
    expect(result.fetchRequestedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  test('a repeat keeps the first time', async () => {
    const ad = await waiting()
    await post(`/ads/${ad.id}/fetch-request`, undefined)
    db.prepare(`UPDATE ads SET fetch_requested_at = '2026-01-01 00:00:00' WHERE id = ?`).run(ad.id)

    const res = await post(`/ads/${ad.id}/fetch-request`, undefined)

    expect(((await res.json()) as Ad).fetchRequestedAt).toBe('2026-01-01 00:00:00')
  })

  test('from another state is 409', async () => {
    const ad = await readyAd({ sourceMode: 'handover' })

    const res = await post(`/ads/${ad.id}/fetch-request`, undefined)

    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: string }).error).toBe('an ad cannot be fetched from ready')
  })

  test('an automatic ad is 409', async () => {
    const ad = await ingest()
    await moved(ad.id, { to: 'awaiting_handover' })

    expect((await post(`/ads/${ad.id}/fetch-request`, undefined)).status).toBe(409)
  })

  test("another user's ad is 404", async () => {
    const ad = await waiting()

    expect((await post(`/ads/${ad.id}/fetch-request`, undefined, otherCookie)).status).toBe(404)
  })

  test('an unknown ad is 404', async () => {
    expect((await post('/ads/9999/fetch-request', undefined)).status).toBe(404)
  })
})

describe('pre-screen', () => {
  test('stores the verdict on a waiting ad', async () => {
    const ad = await waiting()

    const res = await prescreen(ad.id, PROMISING)

    expect(res.status).toBe(200)
    const result = (await res.json()) as Ad
    expect(result.prescreen).toEqual(PROMISING)
    expect(result.state).toBe('awaiting_handover')
  })

  test('from another state is 409', async () => {
    const ad = await readyAd({ sourceMode: 'handover' })

    expect((await prescreen(ad.id, PROMISING)).status).toBe(409)
  })

  test.each([
    ['a bad verdict', { verdict: 'unsure', reason: 'Why.' }],
    ['no reason', { verdict: 'promising' }],
    ['an empty reason', { verdict: 'promising', reason: ' ' }],
    ['an over-long reason', { verdict: 'promising', reason: 'x'.repeat(301) }],
  ])('%s is 400', async (_name, body) => {
    const ad = await waiting()

    expect((await prescreen(ad.id, body)).status).toBe(400)
  })

  test('a reason of 300 characters is accepted', async () => {
    const ad = await waiting()

    expect((await prescreen(ad.id, { verdict: 'not_promising', reason: 'x'.repeat(300) })).status).toBe(200)
  })

  test("another user's ad is 404", async () => {
    const ad = await waiting()

    expect((await prescreen(ad.id, PROMISING, otherCookie)).status).toBe(404)
  })
})

describe('fetch failures from awaiting_handover', () => {
  test('a gone ad moves to failed with its error', async () => {
    const ad = await waiting()

    const result = await moved(ad.id, { to: 'failed', error: 'gone' })

    expect(result.state).toBe('failed')
    expect(result.lastError).toBe('gone')
  })

  test('an attempt keeps the ad waiting, and the third fails it', async () => {
    const ad = await waiting()

    const first = await moved(ad.id, { to: 'awaiting_handover', error: 'network' })
    expect(first.state).toBe('awaiting_handover')
    expect(first.attempts).toBe(1)
    await moved(ad.id, { to: 'awaiting_handover', error: 'network' })
    const third = await moved(ad.id, { to: 'awaiting_handover', error: 'network' })

    expect(third.state).toBe('failed')
    expect(third.lastError).toBe('network')
  })

  test('a same-state request with no error is still 409', async () => {
    const ad = await waiting()

    expect((await transition(ad.id, { to: 'awaiting_handover' })).status).toBe(409)
  })
})

describe('blanking', () => {
  test('dismissing empties the reason and keeps the verdict and the click', async () => {
    const ad = await waiting()
    await prescreen(ad.id, PROMISING)
    await post(`/ads/${ad.id}/fetch-request`, undefined)

    const result = await moved(ad.id, { to: 'dismissed' })

    expect(result.prescreen).toEqual({ verdict: 'promising', reason: '' })
    expect(result.fetchRequestedAt).not.toBeNull()
    expect(result.title).toBe('')
  })

  test('reporting a failed ad empties the reason', async () => {
    const ad = await waiting()
    await prescreen(ad.id, PROMISING)
    await moved(ad.id, { to: 'failed', error: 'gone' })

    await post('/ads/reported', { ids: [ad.id] })

    expect((await readAd(ad.id)).prescreen).toEqual({ verdict: 'promising', reason: '' })
  })

  test('an automatic ad keeps its reason', async () => {
    const ad = await ingest()
    db.prepare('UPDATE ads SET prescreen = ? WHERE id = ?').run(JSON.stringify(PROMISING), ad.id)

    const result = await moved(ad.id, { to: 'dismissed' })

    expect(result.prescreen).toEqual(PROMISING)
  })
})
