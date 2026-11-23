// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { startFakeJobApp } from '../../test/fakeJobApp.ts'
import type { FakeJobApp } from '../../test/fakeJobApp.ts'
import { UNREACHABLE_URL } from '../../test/fakeOllama.ts'
import { runNode } from '../../test/profileFixture.ts'
import { startFakeRunHolder } from '../../test/fakeRunHolder.ts'
import type { RunResult } from '../../test/profileFixture.ts'
import { makeTempDir } from '../../test/tempDir.ts'
import type { TempDir } from '../../test/tempDir.ts'

const command = join(import.meta.dirname, 'run.ts')
let dir: TempDir
let jobApp: FakeJobApp
let stateDir: string

// 127.0.0.1 has nothing on the IMAP and SMTP ports, so both refuse at once.
const mail = 'MAIL_IMAP_HOST=127.0.0.1\nMAIL_SMTP_HOST=127.0.0.1\nMAIL_USERNAME=agent@mail.example\nMAIL_PASSWORD=app\n'

function config(): Record<string, unknown> {
  return {
    ollamaUrl: UNREACHABLE_URL,
    embeddingModel: 'test-embed',
    corpus: [{ path: join(dir.root, 'corpus'), label: 'facts' }],
    sources: { duunitori: { enabled: true, termsCheckedOn: '2026-11-23' } },
    drafting: {
      filePrefix: 'Tester',
      cvTemplates: { fi: join(dir.root, 'cv-fi.md'), en: join(dir.root, 'cv-en.md') },
    },
    summary: { recipient: 'me@mail.example' },
  }
}

beforeEach(async () => {
  dir = makeTempDir()
  jobApp = await startFakeJobApp()
  stateDir = join(dir.root, '.local/state/job-agent')
  dir.write('cv-fi.md', 'CV fi')
  dir.write('cv-en.md', 'CV en')
  dir.write('.config/job-agent/prompts/prescreen.md', 'Pre-screen.')
  dir.write('.config/job-agent/prompts/evaluate.md', 'Evaluate.')
  dir.write('.config/job-agent/prompts/draft.md', 'Draft.')
  dir.write('.config/job-agent/config.json', JSON.stringify(config()))
  const env = `JOBAPP_API_URL=${jobApp.url}\nJOBAPP_USERNAME=${jobApp.username}\nJOBAPP_PASSWORD=${jobApp.password}\n`
  dir.write('.config/job-agent/env', env + mail)
})

afterEach(async () => {
  await jobApp.close()
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

function writeLock(pid: number): void {
  mkdirSync(stateDir, { recursive: true })
  writeFileSync(join(stateDir, 'run.lock'), String(pid))
}

test('a config without a summary recipient exits 2 before taking the lock', async () => {
  const { summary: _summary, ...rest } = config()
  const path = dir.write('.config/job-agent/config.json', JSON.stringify(rest))

  expectOneLineError(await run(), 2, `${path}: summary: Invalid input: expected object, received undefined`)
  expect(existsSync(join(stateDir, 'run.lock'))).toBe(false)
})

test('an enabled Duunitori without termsCheckedOn exits 2', async () => {
  const path = dir.write('.config/job-agent/config.json', JSON.stringify({ ...config(), sources: { duunitori: { enabled: true } } }))

  expectOneLineError(await run(), 2, `${path}: sources.duunitori: termsCheckedOn is required to enable a source that fetches`)
})

test('a missing pre-screen prompt exits 2 naming it', async () => {
  const prompt = join(dir.root, '.config/job-agent/prompts/prescreen.md')
  rmSync(prompt)

  expectOneLineError(await run(), 2, `${prompt}: file not found`)
})

test('an env file without MAIL_SMTP_HOST exits 2', async () => {
  const env = `JOBAPP_API_URL=${jobApp.url}\nJOBAPP_USERNAME=u\nJOBAPP_PASSWORD=p\n`
  const path = dir.write('.config/job-agent/env', env + mail.replace(/MAIL_SMTP_HOST=.*\n/, ''))

  expectOneLineError(await run(), 2, `${path}: MAIL_SMTP_HOST is not set`)
})

test('a lock held by a live run exits 1 and runs no step', async () => {
  const holder = startFakeRunHolder()
  try {
    writeLock(holder.pid)

    expectOneLineError(await run(), 1, `another run is in progress (pid ${holder.pid})`)
    expect(jobApp.requests).toEqual([])
  } finally {
    holder.stop()
  }
})

test('a stale lock is taken over, every step reports, and the lock is released', async () => {
  writeLock(spawnSync('true').pid as number)

  const result = await run()

  expect(result.stdout).toBe(
    [
      'expired hand-overs: 0 dismissed',
      'model steps skipped: Ollama health check failed: unreachable',
      'summary: not sent',
      '',
    ].join('\n'),
  )
  expect(result.stderr).toBe(
    'collect failed: cannot reach mailbox at 127.0.0.1\nsummary failed: cannot reach mail server at 127.0.0.1\n',
  )
  expect(result.status).toBe(1)
  expect(existsSync(join(stateDir, 'run.lock'))).toBe(false)
})

test('an unexpected error keeps its stack and still releases the lock', async () => {
  mkdirSync(join(stateDir, 'source-failures.json'), { recursive: true })

  const result = await run()

  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('EISDIR')
  expect(result.stderr).toContain('    at ')
  expect(existsSync(join(stateDir, 'run.lock'))).toBe(false)
})
