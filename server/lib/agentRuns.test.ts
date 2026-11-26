// @vitest-environment node
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database as Db } from 'better-sqlite3'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { openDatabase } from '../db/index.ts'
import { fakeChild } from '../test/fakeChild.ts'
import type { FakeChild } from '../test/fakeChild.ts'
import type { AgentRun } from '../types.ts'
import { createRunnerSpawner } from './agentRunner.ts'
import { closeInterruptedRuns, currentRun, recentRuns, startRun } from './agentRuns.ts'
import { createLogger } from './logger.ts'
import { seedUser } from './seed.ts'

let root: string
let db: Db
let userId: number
let logLines: string[]
let fake: FakeChild

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'job-app-test-'))
  db = openDatabase(join(root, 'app.db'))
  userId = seedUser(db, 'admin-user', 'admin-password')
  logLines = []
  fake = fakeChild()
})

afterEach(() => {
  db.close()
  rmSync(root, { recursive: true, force: true })
})

function start(kind: 'run' | 'collect' = 'collect'): AgentRun {
  const log = createLogger('info', (line) => logLines.push(line))
  return startRun(db, { kind, userId, runner: () => fake.child, log })
}

function storedRun(id: number): AgentRun {
  return [currentRun(db), ...recentRuns(db)].find((run) => run?.id === id) as AgentRun
}

test('a started run is current, with no finish and no output yet', () => {
  const run = start('run')

  expect(run).toEqual({ id: run.id, kind: 'run', startedAt: expect.any(String), finishedAt: null, exitCode: null, output: '' })
  expect(new Date(run.startedAt).toISOString()).toBe(run.startedAt)
  expect(currentRun(db)).toEqual(run)
})

test('lines from stdout and stderr are appended as they arrive', async () => {
  const run = start()
  fake.stdout.write('first\n')
  fake.stderr.write('warning\n')
  fake.stdout.write('last')

  await fake.close(0)

  expect(storedRun(run.id).output).toBe('first\nwarning\nlast\n')
})

test('output past 65536 characters keeps the tail', async () => {
  const run = start()
  fake.stdout.write(`${'a'.repeat(65530)}\n`)
  fake.stdout.write('tail line\n')

  await fake.close(0)

  const { output } = storedRun(run.id)
  expect(output).toHaveLength(65536)
  expect(output.endsWith('a\ntail line\n')).toBe(true)
})

test.each([
  [0, null, 0],
  [1, null, 1],
  [null, 'SIGKILL', null],
] as const)('close(%o, %o) finishes the run with exit code %o', async (code, signal, exitCode) => {
  const run = start()

  await fake.close(code, signal ?? undefined)

  expect(currentRun(db)).toBeNull()
  expect(recentRuns(db)).toEqual([{ ...run, finishedAt: expect.any(String), exitCode }])
})

test('a child that cannot start finishes with no exit code and says why', async () => {
  const runner = createRunnerSpawner(spawn, join(root, 'missing'), {})
  const log = createLogger('silent')
  const run = startRun(db, { kind: 'collect', userId, runner, log })

  await expect.poll(() => currentRun(db)).toBeNull()

  const finished = storedRun(run.id)
  expect(finished.exitCode).toBeNull()
  expect(finished.output).toMatch(/^\(could not start: spawn .* ENOENT\)\n$/)
})

test('recent runs are the last 10 finished, newest first', async () => {
  const ids: number[] = []
  for (let i = 0; i < 12; i++) {
    fake = fakeChild()
    ids.push(start().id)
    await fake.close(0)
  }

  expect(recentRuns(db).map((run) => run.id)).toEqual(ids.slice(2).reverse())
})

test('closing interrupted runs closes only open rows and says the server restarted', async () => {
  const finished = start()
  fake.stdout.write('done\n')
  await fake.close(0)
  fake = fakeChild()
  const open = start()
  fake.stdout.write('halfway\n')
  await new Promise((resolve) => setImmediate(resolve))

  expect(closeInterruptedRuns(db)).toBe(1)

  expect(currentRun(db)).toBeNull()
  expect(storedRun(open.id)).toMatchObject({ exitCode: null, output: 'halfway\n(server restarted)\n' })
  expect(storedRun(finished.id)).toMatchObject({ exitCode: 0, output: 'done\n' })
})

test('the log says a run started and finished, with ids and exit code but no output', async () => {
  const run = start('run')
  fake.stdout.write('secret output line\n')
  await fake.close(1)

  const entries = logLines.map((line) => JSON.parse(line))
  expect(entries).toEqual([
    { time: expect.any(String), level: 'info', msg: 'agent run started', runId: run.id, kind: 'run', startedBy: userId },
    { time: expect.any(String), level: 'info', msg: 'agent run finished', runId: run.id, kind: 'run', exitCode: 1, durationMs: expect.any(Number) },
  ])
  expect(logLines.join('')).not.toContain('secret output line')
})
