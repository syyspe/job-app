// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { baseUrl, cookie, createApplication, db, ingest, moved, post, readAd, readyAd, withAdsApi } from '../test/adsApi.ts'
import type { Ad, AdState } from '../types.ts'

withAdsApi()

describe('hand-over', () => {
  async function waiting(overrides: Record<string, unknown> = {}): Promise<Ad> {
    const ad = await ingest({ sourceMode: 'handover', ...overrides })
    return moved(ad.id, { to: 'awaiting_handover' })
  }

  test('moves the ad to ready with the text and the given fields', async () => {
    const ad = await waiting()

    const res = await post(`/ads/${ad.id}/handover`, {
      text: 'The full ad.',
      url: 'https://Example.com/moved/?utm_source=x',
      title: 'New title',
      company: 'New company',
    })

    expect(res.status).toBe(200)
    const result = (await res.json()) as Ad
    expect(result.state).toBe('ready')
    expect(result.body).toBe('The full ad.')
    expect(result.url).toBe('https://Example.com/moved/?utm_source=x')
    expect(result.title).toBe('New title')
    expect(result.company).toBe('New company')
  })

  test('fields left out keep their value', async () => {
    const ad = await waiting()

    const res = await post(`/ads/${ad.id}/handover`, { text: 'The full ad.' })

    const result = (await res.json()) as Ad
    expect(result.title).toBe(ad.title)
    expect(result.url).toBe(ad.url)
  })

  test('a title-rejected ad can be handed over anyway', async () => {
    const ad = await ingest()
    await moved(ad.id, { to: 'title_rejected' })

    expect((await post(`/ads/${ad.id}/handover`, { text: 'Text.' })).status).toBe(200)
  })

  test('a handed-over ad matching a duplicate rule ends up duplicate', async () => {
    const original = await ingest({ company: 'Acme', title: 'Test Lead' })
    const ad = await waiting()

    const res = await post(`/ads/${ad.id}/handover`, {
      text: 'Text.',
      company: 'Acme',
      title: 'Test Lead',
    })

    const result = (await res.json()) as Ad
    expect(result.state).toBe('duplicate')
    expect(result.duplicateOf).toBe(original.id)
  })

  test('a new url matching another ad ends up duplicate', async () => {
    const original = await ingest({ url: 'https://example.com/original' })
    const ad = await waiting()

    const res = await post(`/ads/${ad.id}/handover`, {
      text: 'Text.',
      url: 'https://example.com/original/',
    })

    expect(((await res.json()) as Ad).duplicateOf).toBe(original.id)
  })

  test('a state that cannot reach ready is 409', async () => {
    const ad = await readyAd()
    expect((await post(`/ads/${ad.id}/handover`, { text: 'Text.' })).status).toBe(409)
  })

  test.each([
    ['missing text', {}],
    ['blank text', { text: '   ' }],
    ['a non-http url', { text: 'Text.', url: 'javascript:alert(1)' }],
    ['a title that is not a string', { text: 'Text.', title: 7 }],
  ])('%s is 400', async (_name, body) => {
    const ad = await waiting()
    expect((await post(`/ads/${ad.id}/handover`, body)).status).toBe(400)
  })
})

describe('reporting', () => {
  test('sets reportedAt and answers 204', async () => {
    const ad = await ingest()

    const res = await post('/ads/reported', { ids: [ad.id] })

    expect(res.status).toBe(204)
    expect((await readAd(ad.id)).reportedAt).not.toBeNull()
  })

  test.each<[AdState, Record<string, unknown>]>([
    ['title_rejected', { to: 'title_rejected' }],
    ['failed', { to: 'failed', error: 'gone' }],
  ])('blanks a hand-over ad reported in %s', async (_state, body) => {
    const ad = await ingest({ sourceMode: 'handover' })
    await moved(ad.id, body)

    await post('/ads/reported', { ids: [ad.id] })

    const result = await readAd(ad.id)
    expect(result.title).toBe('')
    expect(result.company).toBe('')
  })

  test('blanks a hand-over ad reported in drafted', async () => {
    const ad = await ingest({ sourceMode: 'handover' })
    db.prepare("UPDATE ads SET state = 'drafted' WHERE id = ?").run(ad.id)

    await post('/ads/reported', { ids: [ad.id] })

    expect((await readAd(ad.id)).title).toBe('')
  })

  test('leaves an automatic ad and a pending hand-over ad their title', async () => {
    const automatic = await ingest()
    await moved(automatic.id, { to: 'title_rejected' })
    const pending = await ingest({ sourceMode: 'handover' })

    await post('/ads/reported', { ids: [automatic.id, pending.id] })

    expect((await readAd(automatic.id)).title).toBe(automatic.title)
    expect((await readAd(pending.id)).title).toBe(pending.title)
  })

  test.each([
    ['no ids', {}],
    ['ids that are not an array', { ids: 7 }],
    ['ids that are not whole numbers', { ids: [1.5] }],
    ['ids that are strings', { ids: ['1'] }],
  ])('%s is 400', async (_name, body) => {
    expect((await post('/ads/reported', body)).status).toBe(400)
  })
})

describe('deleting what an ad refers to', () => {
  test('deleting a user removes their ads', async () => {
    const ad = await ingest()

    db.prepare("DELETE FROM users WHERE username = 'testuser'").run()

    expect(db.prepare('SELECT 1 FROM ads WHERE id = ?').get(ad.id)).toBeUndefined()
  })

  test('deleting a draft application leaves the ad with a null applicationId', async () => {
    const ad = await ingest()
    const applicationId = await createApplication({ status: 'draft', dateApplied: '' })
    db.prepare('UPDATE ads SET application_id = ? WHERE id = ?').run(applicationId, ad.id)

    const res = await fetch(`${baseUrl}/api/applications/${applicationId}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    })

    expect(res.status).toBe(204)
    expect((await readAd(ad.id)).applicationId).toBeNull()
  })
})
