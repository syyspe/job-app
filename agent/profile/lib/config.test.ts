// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { makeTempDir } from '../../test/tempDir.ts'
import type { TempDir } from '../../test/tempDir.ts'
import { loadProfileConfig } from './config.ts'

let dir: TempDir

beforeEach(() => {
  dir = makeTempDir()
})

afterEach(() => {
  dir.remove()
})

const valid = {
  ollamaUrl: 'http://laptop.example:11434',
  embeddingModel: 'test-embed',
  corpus: [{ path: '/corpus/facts', label: 'facts' }],
}

function writeConfig(value: unknown): string {
  return dir.write('config.json', JSON.stringify(value))
}

test('a valid config loads, ignoring keys other streams own', () => {
  const path = writeConfig({ ...valid, recipient: 'someone@example.com' })

  expect(loadProfileConfig(path)).toEqual(valid)
})

test('a missing file names the file', () => {
  const path = `${dir.root}/missing.json`

  expect(() => loadProfileConfig(path)).toThrow(`${path}: file not found`)
})

test('invalid JSON names the file', () => {
  const path = dir.write('config.json', '{ not json')

  expect(() => loadProfileConfig(path)).toThrow(`${path}: invalid JSON`)
})

test.each([
  ['a missing key', { ...valid, embeddingModel: undefined }, 'embeddingModel'],
  ['a wrong-typed key', { ...valid, corpus: 'no' }, 'corpus'],
  ['a non-http ollamaUrl', { ...valid, ollamaUrl: 'ftp://laptop:11434' }, 'ollamaUrl'],
  ['a relative corpus path', { ...valid, corpus: [{ path: 'cv', label: 'facts' }] }, 'corpus[0].path'],
  ['a relative syncFolder', { ...valid, syncFolder: 'sync' }, 'syncFolder'],
  ['an unknown label', { ...valid, corpus: [{ path: '/cv', label: 'other' }] }, 'corpus[0].label'],
])('%s is an exit-2 error naming the file and field', (_name, value, field) => {
  const path = writeConfig(value)

  expect(() => loadProfileConfig(path)).toThrow(
    expect.objectContaining({ exitCode: 2, message: expect.stringContaining(`${path}: ${field}: `) }),
  )
})

test('a syncFolder is appended to the corpus as a style entry', () => {
  const path = writeConfig({ ...valid, syncFolder: '/corpus/synced' })

  expect(loadProfileConfig(path)).toEqual({
    ...valid,
    syncFolder: '/corpus/synced',
    corpus: [...valid.corpus, { path: '/corpus/synced', label: 'style' }],
  })
})

test('without a syncFolder the corpus is left as configured', () => {
  const path = writeConfig(valid)

  expect(loadProfileConfig(path).corpus).toEqual(valid.corpus)
})
