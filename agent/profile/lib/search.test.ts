// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { join } from 'node:path'
import { startFakeOllama } from '../../test/fakeOllama.ts'
import type { FakeOllama } from '../../test/fakeOllama.ts'
import { makeTempDir } from '../../test/tempDir.ts'
import type { TempDir } from '../../test/tempDir.ts'
import { buildIndex } from './build.ts'
import { listCorpusFiles } from './corpus.ts'
import { createOllama } from './ollama.ts'
import { cosine, searchIndexFile } from './search.ts'
import { openIndex } from './store.ts'
import type { IndexStore } from './store.ts'

let dir: TempDir
let fake: FakeOllama
let store: IndexStore
let indexFile: string

beforeEach(async () => {
  dir = makeTempDir()
  fake = await startFakeOllama()
  indexFile = join(dir.root, 'profile.db')
  store = openIndex(indexFile)
  dir.write('facts/billing.md', 'Led the migration of a billing system to PostgreSQL.')
  dir.write('facts/mentoring.md', 'Mentored junior developers and ran code reviews.')
  dir.write('style/letter.md', 'I would love to bring my billing experience to your team.')
  const { files } = listCorpusFiles([
    { path: join(dir.root, 'facts'), label: 'facts' },
    { path: join(dir.root, 'style'), label: 'style' },
  ])
  await buildIndex({ files, store, ollama: ollama(), model: 'test-embed' })
})

afterEach(async () => {
  store.close()
  await fake.close()
  dir.remove()
})

function ollama() {
  return createOllama({ url: fake.url, model: 'test-embed' })
}

function search(query: string, options: { label?: 'facts' | 'style'; limit?: number; model?: string } = {}) {
  const deps = { ollama: ollama(), model: options.model ?? 'test-embed' }
  return searchIndexFile(indexFile, deps, { query, label: options.label, limit: options.limit ?? 5 })
}

test('cosine is 1 for the same direction and 0 for orthogonal vectors', () => {
  expect(cosine([1, 2], [2, 4])).toBeCloseTo(1)
  expect(cosine([1, 0], [0, 1])).toBe(0)
})

test('the closest chunk comes first and results carry label and source', async () => {
  const results = await search('mentored junior developers')

  expect(results[0]).toMatchObject({
    source: 'mentoring.md',
    label: 'facts',
    text: 'Mentored junior developers and ran code reviews.',
  })
  expect(results.map((result) => result.score)).toEqual([...results.map((result) => result.score)].sort((a, b) => b - a))
})

test('a label filter returns only that label', async () => {
  const results = await search('billing', { label: 'style' })

  expect(results.map((result) => result.source)).toEqual(['letter.md'])
})

test('limit caps the number of results', async () => {
  expect(await search('billing', { limit: 2 })).toHaveLength(2)
})

test('a missing index refuses with the rebuild hint', async () => {
  indexFile = join(dir.root, 'missing.db')

  await expect(search('billing')).rejects.toThrow('run npm run profile:index')
})

test('an index built with another model refuses', async () => {
  await expect(search('billing', { model: 'other-embed' })).rejects.toThrow(
    'the profile index was built with a different embedding model: run npm run profile:index',
  )
})

test('an index without a completed build refuses', async () => {
  store.resetIndex()

  await expect(search('billing')).rejects.toThrow('the profile index has no completed build')
})

test('an index with another vector dimension refuses', async () => {
  store.completeBuild('test-embed', 1024)

  await expect(search('billing')).rejects.toThrow('the profile index has a different vector dimension')
})
