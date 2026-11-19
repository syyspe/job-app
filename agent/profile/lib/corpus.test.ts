// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { join } from 'node:path'
import { makeTempDir } from '../../test/tempDir.ts'
import type { TempDir } from '../../test/tempDir.ts'
import { listCorpusFiles } from './corpus.ts'

let dir: TempDir

beforeEach(() => {
  dir = makeTempDir()
})

afterEach(() => {
  dir.remove()
})

test('a folder is walked recursively and its files inherit its label', () => {
  const cv = dir.write('facts/cv.md', 'cv')
  const nested = dir.write('facts/older/2020.txt', 'old cv')
  const pdf = dir.write('facts/scan.pdf', 'pdf')

  const result = listCorpusFiles([{ path: join(dir.root, 'facts'), label: 'facts' }])

  expect(result.files).toEqual([
    { path: cv, label: 'facts', source: 'cv.md' },
    { path: nested, label: 'facts', source: 'older/2020.txt' },
  ])
  expect(result.skipped).toEqual([pdf])
})

test('a file entry is its own source by file name', () => {
  const letter = dir.write('letters/letter.md', 'letter')

  const result = listCorpusFiles([{ path: letter, label: 'style' }])

  expect(result.files).toEqual([{ path: letter, label: 'style', source: 'letter.md' }])
})

test('a file reachable from two entries is a config error', () => {
  const letter = dir.write('letters/letter.md', 'letter')

  expect(() =>
    listCorpusFiles([
      { path: join(dir.root, 'letters'), label: 'style' },
      { path: letter, label: 'facts' },
    ]),
  ).toThrow(expect.objectContaining({ exitCode: 2, message: expect.stringContaining('corpus[1]') }))
})

test('a missing corpus path is a config error', () => {
  const path = join(dir.root, 'missing')

  expect(() => listCorpusFiles([{ path, label: 'facts' }])).toThrow(
    expect.objectContaining({ exitCode: 2, message: `config corpus[0].path: ${path} does not exist` }),
  )
})
