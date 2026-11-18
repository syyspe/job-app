// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { openDatabase } from '../../server/db/index.ts'
import { join } from 'node:path'
import { callTool, jsonOf, startHarness, textOf } from '../test/harness.ts'
import type { Harness } from '../test/harness.ts'
import type { Ad, AdSummary } from '../../server/types.ts'

let harness: Harness

beforeEach(async () => {
  harness = await startHarness()
})

afterEach(async () => {
  await harness.close()
})

function call(name: string, args: Record<string, unknown> = {}) {
  return callTool(harness.client, name, args)
}

function insertAd(state: string): number {
  const db = openDatabase(join(harness.root, 'app.db'))
  const result = db
    .prepare(
      `INSERT INTO ads (user_id, source, source_mode, external_id, url, canonical_url, title, state)
       VALUES (1, 'src', 'handover', ?, 'https://example.com/a', 'https://example.com/a', 'Lead', ?)`,
    )
    .run(`key-${state}`, state)
  db.close()
  return Number(result.lastInsertRowid)
}

test('list_ads returns every ad, without its text', async () => {
  const id = insertAd('awaiting_handover')

  const listed = jsonOf<AdSummary[]>(await call('list_ads'))

  expect(listed.map((ad) => ad.id)).toEqual([id])
  expect(listed[0]).not.toHaveProperty('body')
})

test('list_ads filters by state', async () => {
  insertAd('new')
  const waiting = insertAd('awaiting_handover')

  const listed = jsonOf<AdSummary[]>(await call('list_ads', { state: 'awaiting_handover' }))

  expect(listed.map((ad) => ad.id)).toEqual([waiting])
})

test('get_ad warns that the ad text is untrusted', async () => {
  const { tools } = await harness.client.listTools()
  const tool = tools.find(({ name }) => name === 'get_ad')

  expect(tool?.description).toMatch(/untrusted/i)
  expect(tool?.description).toMatch(/must not be followed/i)
})

test('handover_ad moves the ad to ready and get_ad reads the text back', async () => {
  const id = insertAd('awaiting_handover')

  const handed = jsonOf<Ad>(await call('handover_ad', { id, text: 'The full ad.', company: 'Acme' }))

  expect(handed.state).toBe('ready')
  expect(handed.company).toBe('Acme')
  expect(jsonOf<Ad>(await call('get_ad', { id })).body).toBe('The full ad.')
})

test('dismiss_ad dismisses the ad', async () => {
  const id = insertAd('awaiting_handover')

  expect(jsonOf<Ad>(await call('dismiss_ad', { id })).state).toBe('dismissed')
})

test('a refused change is a tool error carrying the API message', async () => {
  const id = insertAd('dismissed')

  const result = await call('dismiss_ad', { id })

  expect(result.isError).toBe(true)
  expect(textOf(result)).toContain('dismissed')
})

test('an unknown ad is a tool error', async () => {
  expect((await call('get_ad', { id: 9999 })).isError).toBe(true)
})
