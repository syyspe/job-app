// @vitest-environment node
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { startFakeRunHolder } from '../../test/fakeRunHolder.ts'
import { runNode } from '../../test/profileFixture.ts'
import type { RunResult } from '../../test/profileFixture.ts'
import { makeTempDir } from '../../test/tempDir.ts'
import type { TempDir } from '../../test/tempDir.ts'

const command = join(import.meta.dirname, 'collect.ts')
let dir: TempDir

const env = 'JOBAPP_API_URL=http://127.0.0.1:1\nJOBAPP_USERNAME=u\nJOBAPP_PASSWORD=p\n'
const mail = 'MAIL_IMAP_HOST=127.0.0.1\nMAIL_USERNAME=alerts@mail.example\nMAIL_PASSWORD=app\n'

beforeEach(() => {
  dir = makeTempDir()
  dir.write('.config/job-agent/config.json', JSON.stringify({ sources: { duunitori: { enabled: true, termsCheckedOn: '2026-11-23' } } }))
  dir.write('.config/job-agent/env', env + mail)
})

afterEach(() => {
  dir.remove()
})

function run() {
  return runNode(command, [], { PATH: process.env.PATH ?? '', HOME: dir.root })
}

function expectOneLineError(result: RunResult, status: number, message: string) {
  expect(result.status).toBe(status)
  expect(result.stderr).toBe(`${message}\n`)
  expect(result.stdout).toBe('')
}

test('an automatic source enabled without a terms check exits 2', async () => {
  const path = dir.write('.config/job-agent/config.json', JSON.stringify({ sources: { nordea: { enabled: true } } }))

  expectOneLineError(await run(), 2, `${path}: sources.nordea: termsCheckedOn is required to enable a source that fetches`)
})

test('no source enabled exits 2 before any mail is read', async () => {
  const path = dir.write('.config/job-agent/config.json', JSON.stringify({}))

  expectOneLineError(await run(), 2, `${path}: sources: no source is enabled`)
})

test('a missing mail variable exits 2', async () => {
  const path = dir.write('.config/job-agent/env', env + mail.replace(/MAIL_PASSWORD=.*\n/, ''))

  expectOneLineError(await run(), 2, `${path}: MAIL_PASSWORD is not set`)
})

const stateDir = () => join(dir.root, '.local/state/job-agent')

test('an unreachable mailbox exits 1 with the watermark unmoved and no lock left', async () => {
  expectOneLineError(await run(), 1, 'cannot reach mailbox at 127.0.0.1')
  expect(existsSync(join(stateDir(), 'mail-watermark.json'))).toBe(false)
  expect(existsSync(join(stateDir(), 'run.lock'))).toBe(false)
})

test('a lock held by a live run exits 1 before any mail is read', async () => {
  const holder = startFakeRunHolder()
  try {
    dir.write('.local/state/job-agent/run.lock', String(holder.pid))

    expectOneLineError(await run(), 1, `another run is in progress (pid ${holder.pid})`)
    expect(existsSync(join(stateDir(), 'mail-watermark.json'))).toBe(false)
  } finally {
    holder.stop()
  }
})
