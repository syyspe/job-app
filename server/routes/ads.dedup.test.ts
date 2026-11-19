// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { adFields, createApplication, db, ingest, moved, post, withAdsApi } from '../test/adsApi.ts'
import type { Ad } from '../types.ts'

withAdsApi()

describe('deduplication by url', () => {
  test('a repeat of another ad is a duplicate pointing at the original', async () => {
    const original = await ingest({ url: 'https://example.com/job/1' })

    const res = await post(
      '/ads',
      adFields({ source: 'othersource', url: 'https://EXAMPLE.com/job/1/?utm_medium=x' }),
    )

    expect(res.status).toBe(201)
    const repeat = (await res.json()) as Ad
    expect(repeat.state).toBe('duplicate')
    expect(repeat.duplicateOf).toBe(original.id)
  })

  test('a duplicate is never a match target', async () => {
    const original = await ingest({ url: 'https://example.com/job/1' })
    await ingest({ source: 'second', url: 'https://example.com/job/1' })

    const third = await ingest({ source: 'third', url: 'https://example.com/job/1' })

    expect(third.duplicateOf).toBe(original.id)
  })

  test('a match against an application leaves duplicateOf null', async () => {
    await createApplication({ link: 'https://example.com/job/2#top' })

    const ad = await ingest({ url: 'https://example.com/job/2' })

    expect(ad.state).toBe('duplicate')
    expect(ad.duplicateOf).toBeNull()
  })

  test('an archived application still matches', async () => {
    const id = await createApplication({ link: 'https://example.com/job/3' })
    db.prepare('UPDATE applications SET archived = 1 WHERE id = ?').run(id)

    expect((await ingest({ url: 'https://example.com/job/3' })).state).toBe('duplicate')
  })

  test('an application link that does not parse never matches', async () => {
    await createApplication({ link: 'see the careers page' })

    expect((await ingest()).state).toBe('new')
  })

  test('a hand-over repeat is blanked as it enters duplicate', async () => {
    await ingest({ url: 'https://example.com/job/4' })

    const repeat = await ingest({
      source: 'duunitori',
      sourceMode: 'handover',
      url: 'https://example.com/job/4',
    })

    expect(repeat.title).toBe('')
    expect(repeat.company).toBe('')
  })
})

describe('deduplication by company and title', () => {
  test('reaching ready with a matching ad redirects to duplicate', async () => {
    const original = await ingest({ company: 'Acme Oy', title: 'Test Lead' })
    const repeat = await ingest({ company: ' ACME  oy', title: 'test lead' })

    const ad = await moved(repeat.id, { to: 'ready', body: 'Text.' })

    expect(ad.state).toBe('duplicate')
    expect(ad.duplicateOf).toBe(original.id)
    expect(ad.body).toBeNull()
  })

  test('the earlier ad survives when it reaches ready before its repeat', async () => {
    const original = await ingest({ company: 'Acme', title: 'Test Lead' })
    const repeat = await ingest({ company: 'Acme', title: 'Test Lead' })

    expect((await moved(original.id, { to: 'ready', body: 'Text.' })).state).toBe('ready')

    const ad = await moved(repeat.id, { to: 'ready', body: 'Text.' })
    expect(ad.state).toBe('duplicate')
    expect(ad.duplicateOf).toBe(original.id)
  })

  test('a later ad that already reached ready still matches', async () => {
    const earlier = await ingest({ company: '', title: 'Test Lead', sourceMode: 'handover' })
    const later = await ingest({ company: 'Acme', title: 'Test Lead' })
    await moved(later.id, { to: 'ready', body: 'Text.' })

    const res = await post(`/ads/${earlier.id}/handover`, { text: 'Text.', company: 'Acme' })

    const ad = (await res.json()) as Ad
    expect(ad.state).toBe('duplicate')
    expect(ad.duplicateOf).toBe(later.id)
  })

  test('an ad first seen over 90 days ago does not match', async () => {
    const old = await ingest({ company: 'Acme', title: 'Test Lead' })
    db.prepare("UPDATE ads SET first_seen_at = datetime('now', '-91 days') WHERE id = ?").run(
      old.id,
    )
    const repeat = await ingest({ company: 'Acme', title: 'Test Lead' })

    expect((await moved(repeat.id, { to: 'ready', body: 'Text.' })).state).toBe('ready')
  })

  test('a matching application, archived included, redirects with a null duplicateOf', async () => {
    const id = await createApplication({ company: 'Acme', role: 'Test Lead' })
    db.prepare('UPDATE applications SET archived = 1 WHERE id = ?').run(id)
    const ad = await ingest({ company: 'acme', title: 'TEST LEAD' })

    const result = await moved(ad.id, { to: 'ready', body: 'Text.' })

    expect(result.state).toBe('duplicate')
    expect(result.duplicateOf).toBeNull()
  })

  test('the rule is skipped while the company is unknown', async () => {
    await ingest({ company: '', title: 'Test Lead' })
    const repeat = await ingest({ company: '', title: 'Test Lead' })

    expect((await moved(repeat.id, { to: 'ready', body: 'Text.' })).state).toBe('ready')
  })

  test('two ads with a company but no title are not the same ad', async () => {
    const first = await ingest({ sourceMode: 'handover' })
    const second = await ingest({ sourceMode: 'handover' })
    db.prepare("UPDATE ads SET title = '', company = 'Acme' WHERE id IN (?, ?)").run(
      first.id,
      second.id,
    )

    expect((await moved(second.id, { to: 'ready', body: 'Text.' })).state).toBe('ready')
  })
})
