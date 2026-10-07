// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readLocalFile } from './files.ts'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'job-app-files-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

test('a missing path says there is no file, keeping the ENOENT as its cause', async () => {
  const missing = join(root, 'missing.pdf')
  const error = (await readLocalFile(missing).catch((e) => e)) as Error

  expect(error.message).toBe(`no file at ${missing}`)
  expect((error.cause as NodeJS.ErrnoException).code).toBe('ENOENT')
})

test('a directory is not reported as a missing file', async () => {
  const error = (await readLocalFile(root).catch((e) => e)) as NodeJS.ErrnoException

  expect(error.code).toBe('EISDIR')
  expect(error.message).not.toContain('no file at')
})
