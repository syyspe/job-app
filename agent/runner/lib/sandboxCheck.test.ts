// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { join } from 'node:path'
import { makeTempDir } from '../../test/tempDir.ts'
import type { TempDir } from '../../test/tempDir.ts'
import { ensureSandboxVerified, readCheckRecord, requirePassedCheck, verifySandbox, writeCheckRecord } from './sandboxCheck.ts'

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

const now = () => new Date('2026-11-20T18:00:00.000Z')
const passing = async () => [{ property: 'no Bash', ok: true, detail: '' }]
const failing = async () => [
  { property: 'no Bash', ok: false, detail: 'Bash was offered' },
  { property: 'no web', ok: true, detail: '' },
  { property: 'no files', ok: false, detail: 'Read was offered' },
]

test('a passing verification records the version', async () => {
  const result = await verifySandbox({ version: '9.9.9', stateDir, runProbes: passing, now })

  expect(result.passed).toBe(true)
  expect(readCheckRecord(stateDir)).toEqual({ cliVersion: '9.9.9', checkedAt: '2026-11-20T18:00:00.000Z' })
})

test('a failing verification records nothing', async () => {
  const result = await verifySandbox({ version: '9.9.9', stateDir, runProbes: failing, now })

  expect(result.passed).toBe(false)
  expect(readCheckRecord(stateDir)).toBeUndefined()
})

test('a record for the installed version runs no probe', async () => {
  writeCheckRecord(stateDir, { cliVersion: '9.9.9', checkedAt: '' })
  const probes = vi.fn(passing)

  const result = await ensureSandboxVerified({ claudeBin: fakeClaude, stateDir, runProbes: probes, now })

  expect(result).toEqual({ version: '9.9.9', reverified: false })
  expect(probes).not.toHaveBeenCalled()
})

test('an updated CLI is probed once and the record rewritten', async () => {
  writeCheckRecord(stateDir, { cliVersion: '9.9.8', checkedAt: '' })

  const result = await ensureSandboxVerified({ claudeBin: fakeClaude, stateDir, runProbes: passing, now })

  expect(result).toEqual({ version: '9.9.9', reverified: true })
  expect(readCheckRecord(stateDir)?.cliVersion).toBe('9.9.9')
})

test('a missing CLI rejects naming it and runs no probe', async () => {
  const probes = vi.fn(passing)
  const claudeBin = join(dir.root, 'no-claude')

  await expect(ensureSandboxVerified({ claudeBin, stateDir, runProbes: probes, now })).rejects.toMatchObject({
    message: `${claudeBin} not found on PATH`,
  })
  expect(probes).not.toHaveBeenCalled()
})

test('failing probes throw naming the failed properties and keep the old record', async () => {
  writeCheckRecord(stateDir, { cliVersion: '9.9.8', checkedAt: '' })

  await expect(ensureSandboxVerified({ claudeBin: fakeClaude, stateDir, runProbes: failing, now })).rejects.toMatchObject({
    exitCode: 1,
    message: 'sandbox check failed for claude 9.9.9: no Bash, no files',
  })
  expect(readCheckRecord(stateDir)?.cliVersion).toBe('9.9.8')
})
