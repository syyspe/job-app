// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { adFields, baseUrl, db, get, ingest, otherCookie, post, readAd, readyAd, transition, withAdsApi } from '../test/adsApi.ts'
import type { Ad, AdSummary } from '../types.ts'

withAdsApi()

describe('no session', () => {
  test.each([
    ['GET', '/api/ads'],
    ['GET', '/api/ads/1'],
    ['POST', '/api/ads'],
    ['POST', '/api/ads/1/transition'],
    ['POST', '/api/ads/1/handover'],
    ['POST', '/api/ads/reported'],
  ])('%s %s is 401', async (method, path) => {
    const res = await fetch(`${baseUrl}${path}`, { method })
    expect(res.status).toBe(401)
  })
})

describe('ingest', () => {
  test('a new ad is 201 in state new', async () => {
    const res = await post('/ads', adFields({ location: 'Helsinki', deadline: 'soon' }))

    expect(res.status).toBe(201)
    const ad = (await res.json()) as Ad
    expect(ad.state).toBe('new')
    expect(ad.location).toBe('Helsinki')
    expect(ad.deadline).toBe('soon')
    expect(ad.attempts).toBe(0)
  })

  test('the external id falls back to the canonical url', async () => {
    const ad = await ingest({ url: 'https://Jobs.example.com/ad/x/?utm_source=mail' })
    expect(ad.externalId).toBe('https://jobs.example.com/ad/x')
  })

  test('a known key returns the existing row with 200', async () => {
    const first = await ingest({ externalId: 'abc' })

    const res = await post('/ads', adFields({ externalId: 'abc', sourceMode: 'handover' }))

    expect(res.status).toBe(200)
    const again = (await res.json()) as Ad
    expect(again.id).toBe(first.id)
    expect(again.sourceMode).toBe('automatic')
  })

  test.each([
    ['source', { source: '' }],
    ['sourceMode', { sourceMode: 'manual' }],
    ['title', { title: '' }],
    ['url', { url: 'not a url' }],
    ['a non-http url', { url: 'javascript:alert(1)' }],
    ['company', { company: 7 }],
  ])('rejects a bad %s with 400', async (_name, overrides) => {
    expect((await post('/ads', adFields(overrides))).status).toBe(400)
  })

  test('a body that is not an object is 400', async () => {
    expect((await post('/ads', ['x'])).status).toBe(400)
  })

  test('a body over the parser limit is 413 in the standard shape', async () => {
    const res = await post('/ads', adFields({ title: 'x'.repeat(200_000) }))

    expect(res.status).toBe(413)
    const body = (await res.json()) as { error: string; requestId: string }
    expect(body.error).toBeTruthy()
    expect(body.requestId).toBe(res.headers.get('x-request-id'))
  })
})

describe('reading', () => {
  test('the list is newest first and carries no body', async () => {
    const older = await readyAd()
    const newer = await ingest()
    db.prepare("UPDATE ads SET first_seen_at = '2026-01-01 00:00:00' WHERE id = ?").run(older.id)

    const listed = (await (await get('/ads')).json()) as AdSummary[]

    expect(listed.map((ad) => ad.id)).toEqual([newer.id, older.id])
    expect(listed[1]).not.toHaveProperty('body')
  })

  test('the list filters by state', async () => {
    const ready = await readyAd()
    await ingest()

    const listed = (await (await get('/ads?state=ready')).json()) as AdSummary[]

    expect(listed.map((ad) => ad.id)).toEqual([ready.id])
  })

  test('an unknown state is 400', async () => {
    expect((await get('/ads?state=bogus')).status).toBe(400)
  })

  test('one ad carries its body', async () => {
    const ad = await readyAd()
    expect((await readAd(ad.id)).body).toBe('The ad text.')
  })

  test('an unknown id is 404', async () => {
    expect((await get('/ads/9999')).status).toBe(404)
    expect((await transition(9999, { to: 'dismissed' })).status).toBe(404)
    expect((await post('/ads/9999/handover', { text: 'x' })).status).toBe(404)
  })
})

describe('isolation between users', () => {
  test("another user's ad is 404 everywhere and missing from their list", async () => {
    const ad = await ingest()

    expect((await get(`/ads/${ad.id}`, otherCookie)).status).toBe(404)
    expect((await post(`/ads/${ad.id}/transition`, { to: 'dismissed' }, otherCookie)).status).toBe(
      404,
    )
    expect((await post(`/ads/${ad.id}/handover`, { text: 'x' }, otherCookie)).status).toBe(404)
    expect(await (await get('/ads', otherCookie)).json()).toEqual([])
  })

  test('the same key and url are separate ads for separate users', async () => {
    const fields = adFields({ externalId: 'shared' })
    const mine = (await (await post('/ads', fields)).json()) as Ad

    const res = await post('/ads', fields, otherCookie)

    expect(res.status).toBe(201)
    const theirs = (await res.json()) as Ad
    expect(theirs.id).not.toBe(mine.id)
    expect(theirs.state).toBe('new')
  })

  test('reporting skips ids the user does not own', async () => {
    const ad = await ingest()

    expect((await post('/ads/reported', { ids: [ad.id] }, otherCookie)).status).toBe(204)
    expect((await readAd(ad.id)).reportedAt).toBeNull()
  })
})
