// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { join } from 'node:path'
import { makeTempDir } from '../../test/tempDir.ts'
import type { TempDir } from '../../test/tempDir.ts'
import { readCheckRecord, requirePassedCheck, writeCheckRecord } from './sandboxCheck.ts'

// fakeClaude.ts reports version 9.9.9.
const fakeClaude = join(import.meta.dirname, '..', '..', 'test', 'fakeClaude.ts')
let dir: TempDir
let stateDir: string

beforeEach(() => {
  dir = makeTempDir()
  stateDir = join(dir.root, 'state', 'job-agent')
})

afterEach(() => {
  dir.remove()
})

test('a record for the installed version passes', () => {
  writeCheckRecord(stateDir, { cliVersion: '9.9.9', checkedAt: '2026-11-19T10:00:00.000Z' })

  expect(readCheckRecord(stateDir)).toEqual({ cliVersion: '9.9.9', checkedAt: '2026-11-19T10:00:00.000Z' })
  expect(() => requirePassedCheck(fakeClaude, stateDir)).not.toThrow()
})

test('no record exits 2 with the command to run', () => {
  expect(() => requirePassedCheck(fakeClaude, stateDir)).toThrow(
    expect.objectContaining({ exitCode: 2, message: 'sandbox not verified for claude 9.9.9: run npm run agent:sandbox-check' }),
  )
})

test('a record for another version exits 2', () => {
  writeCheckRecord(stateDir, { cliVersion: '9.9.8', checkedAt: '' })

  expect(() => requirePassedCheck(fakeClaude, stateDir)).toThrow(expect.objectContaining({ exitCode: 2 }))
})

test('a missing CLI exits 2 naming it', () => {
  expect(() => requirePassedCheck(join(dir.root, 'no-claude'), stateDir)).toThrow(
    expect.objectContaining({ exitCode: 2, message: `${join(dir.root, 'no-claude')} not found on PATH` }),
  )
})
