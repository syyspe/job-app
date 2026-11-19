// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { evaluation, ingest, moved, readyAd, transition, withAdsApi } from '../test/adsApi.ts'
import type { Ad } from '../types.ts'

withAdsApi()

describe('failed attempts', () => {
  test.each<[string, () => Promise<Ad>, string]>([
    ['new', () => ingest(), 'new'],
    ['ready', () => readyAd(), 'ready'],
  ])('an attempt from %s counts and keeps the state', async (_name, makeAd, state) => {
    const ad = await makeAd()

    const result = await moved(ad.id, { to: state, error: 'fetch_failed' })

    expect(result.state).toBe(state)
    expect(result.attempts).toBe(1)
    expect(result.lastError).toBe('fetch_failed')
  })

  test('an attempt from suitable needs no evaluation', async () => {
    const ad = await readyAd()
    await moved(ad.id, { to: 'suitable', evaluation: evaluation('suitable') })

    const result = await moved(ad.id, { to: 'suitable', error: 'draft_failed' })

    expect(result.attempts).toBe(1)
    expect(result.body).toBe('The ad text.')
  })

  test('the third attempt fails the ad and clears its body', async () => {
    const ad = await readyAd()
    await moved(ad.id, { to: 'ready', error: 'model_failed' })
    await moved(ad.id, { to: 'ready', error: 'model_failed' })

    const result = await moved(ad.id, { to: 'ready', error: 'model_failed' })

    expect(result.state).toBe('failed')
    expect(result.attempts).toBe(3)
    expect(result.lastError).toBe('model_failed')
    expect(result.body).toBeNull()
  })

  test('a same-state request with no error is 409', async () => {
    const ad = await readyAd()
    expect((await transition(ad.id, { to: 'ready', body: 'Text.' })).status).toBe(409)
  })

  test('a same-state attempt outside new, ready and suitable is 409', async () => {
    const ad = await ingest()
    await moved(ad.id, { to: 'failed', error: 'gone' })

    expect((await transition(ad.id, { to: 'failed', error: 'gone' })).status).toBe(409)
  })
})

describe('retrying a failed ad', () => {
  test('an automatic ad goes back to new with its bookkeeping reset', async () => {
    const ad = await readyAd()
    await moved(ad.id, { to: 'suitable', evaluation: evaluation('suitable') })
    await moved(ad.id, { to: 'failed', error: 'draft_failed' })

    const result = await moved(ad.id, { to: 'new' })

    expect(result.state).toBe('new')
    expect(result.attempts).toBe(0)
    expect(result.lastError).toBeNull()
    expect(result.evaluation).toBeNull()
  })

  test('a hand-over ad goes back to awaiting_handover', async () => {
    const ad = await ingest({ sourceMode: 'handover' })
    await moved(ad.id, { to: 'failed', error: 'gone' })

    expect((await moved(ad.id, { to: 'awaiting_handover' })).state).toBe('awaiting_handover')
  })

  test.each([
    ['automatic', 'awaiting_handover'],
    ['handover', 'new'],
  ])('a %s ad retried to %s is 409', async (sourceMode, to) => {
    const ad = await ingest({ sourceMode })
    await moved(ad.id, { to: 'failed', error: 'gone' })

    expect((await transition(ad.id, { to })).status).toBe(409)
  })
})
