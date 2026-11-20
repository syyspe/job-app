// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { startFakeJobApp } from '../../test/fakeJobApp.ts'
import type { FakeAttachment, FakeJobApp } from '../../test/fakeJobApp.ts'
import { startFakeOllama } from '../../test/fakeOllama.ts'
import type { FakeOllama } from '../../test/fakeOllama.ts'
import { makeTempDir } from '../../test/tempDir.ts'
import type { TempDir } from '../../test/tempDir.ts'
import { createOllama } from '../../profile/lib/ollama.ts'
import { openIndex } from '../../profile/lib/store.ts'
import type { IndexStore } from '../../profile/lib/store.ts'
import { createJobAppClient } from './jobApp.ts'
import type { JobAppClient } from './jobApp.ts'
import { formatSyncResult, syncProfile } from './sync.ts'

let dir: TempDir
let ollamaFake: FakeOllama
let jobAppFake: FakeJobApp
let store: IndexStore
let syncFolder: string

beforeEach(async () => {
  dir = makeTempDir()
  ollamaFake = await startFakeOllama()
  jobAppFake = await startFakeJobApp()
  store = openIndex(join(dir.root, 'profile.db'))
  syncFolder = join(dir.root, 'synced')
  mkdirSync(syncFolder)
})

afterEach(async () => {
  store.close()
  await ollamaFake.close()
  await jobAppFake.close()
  dir.remove()
})

function mark(attachment: Omit<FakeAttachment, 'pending'>): void {
  jobAppFake.attachments.push({ ...attachment, pending: true })
}

function sync(wrap: (client: JobAppClient) => JobAppClient = (client) => client) {
  const jobApp = wrap(createJobAppClient({
    baseUrl: jobAppFake.url,
    username: jobAppFake.username,
    password: jobAppFake.password,
    envPath: 'env',
  }))
  const config = {
    ollamaUrl: ollamaFake.url,
    embeddingModel: 'test-embed',
    corpus: [{ path: syncFolder, label: 'style' as const }],
    syncFolder,
  }
  const ollama = createOllama({ url: config.ollamaUrl, model: config.embeddingModel })
  return syncProfile({ jobApp, config, store, ollama })
}

test('a marked attachment is copied as <id>-<name>, indexed, and its mark cleared', async () => {
  mark({ id: 7, originalName: 'letter.md', content: 'I would love to join.' })

  const result = await sync()

  expect(result.synced).toEqual(['7-letter.md'])
  expect(readFileSync(join(syncFolder, '7-letter.md'), 'utf8')).toBe('I would love to join.')
  expect(result.build).toMatchObject({ added: 1, chunks: 1 })
  expect(result.skipped).toEqual([])
  expect(result.changed).toEqual([])
  expect(jobAppFake.flagCalls).toEqual([{ id: 7, pending: false, storedName: '7.bin' }])
})

test('a name with a path and unsafe characters stays inside the sync folder', async () => {
  mark({ id: 8, originalName: '../evil name.md', content: 'text' })

  const result = await sync()

  expect(result.synced).toEqual(['8-evil_name.md'])
  expect(readdirSync(syncFolder)).toEqual(['8-evil_name.md'])
  expect(existsSync(join(dir.root, 'evil name.md'))).toBe(false)
})

test('re-marking a renamed upload replaces the old copy', async () => {
  mark({ id: 9, originalName: 'letter.md', content: 'First draft.' })
  await sync()
  jobAppFake.attachments[0] = { id: 9, originalName: 'letter-v2.md', content: 'Second draft.', pending: true }

  const result = await sync()

  expect(readdirSync(syncFolder)).toEqual(['9-letter-v2.md'])
  expect(result.build).toMatchObject({ added: 1, removed: 1 })
})

test('a .pdf is copied but reported as skipped', async () => {
  mark({ id: 10, originalName: 'cv.pdf', content: '%PDF' })

  const result = await sync()

  expect(readdirSync(syncFolder)).toEqual(['10-cv.pdf'])
  expect(result.skipped).toEqual([join(syncFolder, '10-cv.pdf')])
  expect(jobAppFake.flagCalls).toEqual([{ id: 10, pending: false, storedName: '10.bin' }])
})

test('an embed failure keeps the copy and leaves the mark set', async () => {
  mark({ id: 11, originalName: 'letter.md', content: 'text' })
  ollamaFake.failure = 'status'

  await expect(sync()).rejects.toThrow('Ollama embedding failed: 500')

  expect(readdirSync(syncFolder)).toEqual(['11-letter.md'])
  expect(jobAppFake.flagCalls).toEqual([])
  expect(jobAppFake.attachments[0].pending).toBe(true)
})

test('nothing marked still builds the index', async () => {
  dir.write('synced/1-old.md', 'kept from an earlier sync')

  const result = await sync()

  expect(result.synced).toEqual([])
  expect(result.build).toMatchObject({ added: 1 })
})

test('an attachment replaced during the sync keeps its mark and is listed as changed', async () => {
  mark({ id: 12, originalName: 'letter.md', content: 'Old text.' })
  const replaceAfterDownload = (client: JobAppClient): JobAppClient => ({
    ...client,
    downloadAttachment: async (id) => {
      const bytes = await client.downloadAttachment(id)
      jobAppFake.attachments[0].storedName = 'replaced.bin'
      return bytes
    },
  })

  const result = await sync(replaceAfterDownload)

  expect(result.synced).toEqual(['12-letter.md'])
  expect(result.changed).toEqual(['12-letter.md'])
  expect(jobAppFake.attachments[0].pending).toBe(true)
})

test('the result lines list kept-marked copies after the build summary', () => {
  const build = { added: 1, updated: 0, removed: 0, unchanged: 0, chunks: 1 }

  const lines = formatSyncResult({ synced: ['12-letter.md'], build, skipped: [], changed: ['12-letter.md'] })

  expect(lines).toEqual([
    'synced 1 attachments',
    '  12-letter.md',
    'added 1, updated 0, removed 0, unchanged 0; 1 chunks embedded',
    'kept marked (changed during sync): 12-letter.md',
  ])
})
