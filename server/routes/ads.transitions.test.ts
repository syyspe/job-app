// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { db, evaluation, ingest, moved, readyAd, transition, withAdsApi } from '../test/adsApi.ts'

withAdsApi()

describe('transitions', () => {
  test('a disallowed transition is 409', async () => {
    const ad = await ingest()
    expect((await transition(ad.id, { to: 'suitable', evaluation: evaluation('suitable') })).status).toBe(409)
  })

  test('drafted is 409 even from suitable', async () => {
    const ad = await readyAd()
    await moved(ad.id, { to: 'suitable', evaluation: evaluation('suitable') })

    expect((await transition(ad.id, { to: 'drafted' })).status).toBe(409)
  })

  test.each([
    ['an unknown to', { to: 'bogus' }],
    ['a missing to', {}],
    ['a body that is not a string', { to: 'ready', body: 7 }],
    ['an error outside the category pattern', { to: 'failed', error: 'Ad said: hello' }],
    ['an error that is too long', { to: 'failed', error: 'x'.repeat(41) }],
  ])('%s is 400', async (_name, body) => {
    const ad = await ingest()
    expect((await transition(ad.id, body)).status).toBe(400)
  })

  test('failed requires an error', async () => {
    const ad = await ingest()
    expect((await transition(ad.id, { to: 'failed' })).status).toBe(400)
  })

  test('ready requires non-empty text', async () => {
    const ad = await ingest()
    expect((await transition(ad.id, { to: 'ready' })).status).toBe(400)
    expect((await transition(ad.id, { to: 'ready', body: '  ' })).status).toBe(400)
  })

  test.each([
    ['missing', undefined],
    ['the wrong verdict', evaluation('unsuitable')],
    ['no fit summary', { verdict: 'suitable', reasons: [] }],
    ['reasons that are not strings', { verdict: 'suitable', fitSummary: 'x', reasons: [1] }],
    ['not an object', 'good'],
  ])('an evaluation with %s is 400', async (_name, given) => {
    const ad = await readyAd()
    expect((await transition(ad.id, { to: 'suitable', evaluation: given })).status).toBe(400)
  })

  test('an evaluation is stored and read back', async () => {
    const ad = await readyAd()

    const result = await moved(ad.id, { to: 'suitable', evaluation: evaluation('suitable') })

    expect(result.evaluation).toEqual(evaluation('suitable'))
    expect(result.body).toBe('The ad text.')
  })

  test.each<[string, Record<string, unknown>]>([
    ['unsuitable', { to: 'unsuitable', evaluation: evaluation('unsuitable') }],
    ['dismissed', { to: 'dismissed' }],
    ['duplicate', { to: 'duplicate' }],
    ['failed', { to: 'failed', error: 'gone' }],
  ])('entering %s clears the body', async (_state, body) => {
    const ad = await readyAd()
    expect((await moved(ad.id, body)).body).toBeNull()
  })

  test('title_rejected clears the body', async () => {
    const ad = await ingest()
    expect((await moved(ad.id, { to: 'title_rejected' })).body).toBeNull()
  })

  test('a state change resets reportedAt and bumps updatedAt', async () => {
    const ad = await ingest()
    db.prepare(
      "UPDATE ads SET reported_at = '2026-01-01 00:00:00', updated_at = '2026-01-01 00:00:00' WHERE id = ?",
    ).run(ad.id)

    const result = await moved(ad.id, { to: 'title_rejected' })

    expect(result.reportedAt).toBeNull()
    expect(result.updatedAt).not.toBe('2026-01-01 00:00:00')
  })

  test.each<[string, Record<string, unknown>]>([
    ['unsuitable', { to: 'unsuitable', evaluation: evaluation('unsuitable') }],
    ['dismissed', { to: 'dismissed' }],
    ['duplicate', { to: 'duplicate' }],
  ])('a hand-over ad entering %s keeps its title and company and loses its text', async (_state, body) => {
    const ad = await readyAd({ sourceMode: 'handover' })

    const result = await moved(ad.id, body)

    expect(result.title).toBe(ad.title)
    expect(result.company).toBe(ad.company)
    expect(result.body).toBeNull()
  })
})

describe('company and deadline on entering ready', () => {
  test('fill the stored fields while they are empty', async () => {
    const ad = await ingest({ company: '' })

    const ready = await moved(ad.id, { to: 'ready', body: 'Text.', company: 'Page Oy', deadline: '2026-12-31' })

    expect(ready.company).toBe('Page Oy')
    expect(ready.deadline).toBe('2026-12-31')
  })

  test('leave fields the alert already set alone', async () => {
    const ad = await ingest({ company: 'Alert Oy', deadline: '2026-12-01' })

    const ready = await moved(ad.id, { to: 'ready', body: 'Text.', company: 'Page Oy', deadline: '2026-12-31' })

    expect(ready.company).toBe('Alert Oy')
    expect(ready.deadline).toBe('2026-12-01')
  })

  test('a company only the page names feeds the title rule', async () => {
    const original = await ingest({ company: 'Page Oy', title: 'Test Lead' })
    const repeat = await ingest({ company: '', title: 'Test Lead' })

    const ad = await moved(repeat.id, { to: 'ready', body: 'Text.', company: 'Page Oy' })

    expect(ad.state).toBe('duplicate')
    expect(ad.duplicateOf).toBe(original.id)
  })

  test('a company that is not a string is 400', async () => {
    const ad = await ingest()
    expect((await transition(ad.id, { to: 'ready', body: 'Text.', company: 7 })).status).toBe(400)
  })
})
