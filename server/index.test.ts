// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const entry = join(import.meta.dirname, 'index.ts')
let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'job-app-index-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function run(env: Record<string, string>) {
  return spawnSync(process.execPath, [entry], {
    env: { PATH: process.env.PATH ?? '', ...env },
    encoding: 'utf8',
  })
}

test('missing DB_PATH and UPLOADS_DIR exit 2 with one line and no stack', () => {
  const result = run({})

  expect(result.status).toBe(2)
  expect(result.stderr).toContain('DB_PATH and UPLOADS_DIR must both be set')
  expect(result.stderr).not.toContain('    at ')
})

test('an invalid PAGE_SIZE exits 2 with its message and no stack', () => {
  const result = run({
    DB_PATH: join(root, 'app.db'),
    UPLOADS_DIR: join(root, 'uploads'),
    PAGE_SIZE: '0',
  })

  expect(result.status).toBe(2)
  expect(result.stderr).toContain('PAGE_SIZE must be a whole number of at least 1')
  expect(result.stderr).not.toContain('    at ')
})

test('an invalid LOG_LEVEL exits 2 with its message and no stack', () => {
  const result = run({
    DB_PATH: join(root, 'app.db'),
    UPLOADS_DIR: join(root, 'uploads'),
    LOG_LEVEL: 'loud',
  })

  expect(result.status).toBe(2)
  expect(result.stderr).toContain('LOG_LEVEL must be one of debug, info, warn, error, silent')
  expect(result.stderr).not.toContain('    at ')
})
