// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { FAKE_DIMENSIONS, startFakeOllama } from '../../test/fakeOllama.ts'
import type { FakeOllama } from '../../test/fakeOllama.ts'
import { makeTempDir } from '../../test/tempDir.ts'
import type { TempDir } from '../../test/tempDir.ts'
import { buildIndex } from './build.ts'
import type { Label } from './config.ts'
import { listCorpusFiles } from './corpus.ts'
import { createOllama } from './ollama.ts'
import { openIndex } from './store.ts'
import type { IndexStore } from './store.ts'

let dir: TempDir
let fake: FakeOllama
let store: IndexStore
let label: Label

beforeEach(async () => {
  dir = makeTempDir()
  fake = await startFakeOllama()
  store = openIndex(join(dir.root, 'index', 'profile.db'))
  label = 'facts'
  dir.write('corpus/cv.md', 'Led the migration of a billing system.')
  dir.write('corpus/skills.txt', 'TypeScript, SQL and test automation.')
  dir.write('corpus/notes.md', 'Mentored two junior developers.')
})

afterEach(async () => {
  store.close()
  await fake.close()
  dir.remove()
})

function build(model = 'test-embed') {
  const { files } = listCorpusFiles([{ path: join(dir.root, 'corpus'), label }])
  return buildIndex({ files, store, ollama: createOllama({ url: fake.url, model }), model })
}

function sources(): string[] {
  return store.allChunks().map((chunk) => chunk.source)
}

test('the first build embeds every file and records the model', async () => {
  const summary = await build()

  expect(summary).toEqual({ added: 3, updated: 0, removed: 0, unchanged: 0, chunks: 3 })
  expect(store.readMeta()).toEqual({ model: 'test-embed', dimensions: FAKE_DIMENSIONS })
  expect(sources()).toEqual(['cv.md', 'notes.md', 'skills.txt'])
})

test('an unchanged rerun makes no embed requests', async () => {
  await build()
  fake.embedRequests = 0

  const summary = await build()

  expect(summary).toEqual({ added: 0, updated: 0, removed: 0, unchanged: 3, chunks: 0 })
  expect(fake.embedRequests).toBe(0)
  expect(store.readMeta()).toEqual({ model: 'test-embed', dimensions: FAKE_DIMENSIONS })
})

test('a changed file is re-embedded alone', async () => {
  await build()
  fake.embedRequests = 0
  dir.write('corpus/cv.md', 'Led the migration of two billing systems.')

  const summary = await build()

  expect(summary).toMatchObject({ updated: 1, unchanged: 2 })
  expect(fake.embedRequests).toBe(1)
  expect(store.allChunks().map((chunk) => chunk.text)).toContain('Led the migration of two billing systems.')
})

test('a deleted file is removed with its chunks', async () => {
  await build()
  rmSync(join(dir.root, 'corpus/notes.md'))

  const summary = await build()

  expect(summary).toMatchObject({ removed: 1, unchanged: 2 })
  expect(sources()).toEqual(['cv.md', 'skills.txt'])
})

test('a label change re-embeds the file under its new label', async () => {
  await build()
  label = 'style'

  const summary = await build()

  expect(summary).toMatchObject({ updated: 3, unchanged: 0 })
  expect(store.allChunks('style')).toHaveLength(3)
  expect(store.allChunks('facts')).toHaveLength(0)
})

test('a model change re-embeds everything', async () => {
  await build()
  fake.models = ['other-embed:latest']

  const summary = await build('other-embed')

  expect(summary).toMatchObject({ added: 3, unchanged: 0 })
  expect(store.readMeta()?.model).toBe('other-embed')
})

test('an embed failure mid model change leaves no completed model', async () => {
  await build()
  fake.failAfter = fake.embedRequests + 1
  fake.failure = 'status'

  await expect(build('other-embed')).rejects.toMatchObject({ exitCode: 1 })

  expect(store.readMeta()).toBeUndefined()
})

test('an embed failure mid same-model build keeps earlier files whole', async () => {
  await build()
  dir.write('corpus/cv.md', 'Rewrote the billing system.')
  dir.write('corpus/skills.txt', 'Rust and Go.')
  fake.failAfter = fake.embedRequests + 1
  fake.failure = 'status'

  await expect(build()).rejects.toMatchObject({ exitCode: 1 })

  expect(store.readMeta()?.model).toBe('test-embed')
  expect(store.allChunks().map((chunk) => chunk.text)).toEqual([
    'Rewrote the billing system.',
    'Mentored two junior developers.',
    'TypeScript, SQL and test automation.',
  ])
})
