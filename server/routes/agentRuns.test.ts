// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ChildProcess } from 'node:child_process'
import type { Database as Db } from 'better-sqlite3'
import type { Server } from 'node:http'
import { openDatabase } from '../db/index.ts'
import { createApp } from '../app.ts'
import { createRunnerSpawner } from '../lib/agentRunner.ts'
import type { RunnerSpawner, SpawnFn } from '../lib/agentRunner.ts'
import { createUser, seedUser } from '../lib/seed.ts'
import { fakeChild } from '../test/fakeChild.ts'
import type { FakeChild } from '../test/fakeChild.ts'
import { loginAs } from '../test/auth.ts'
import type { AgentRun, AgentRunKind, AgentRuns } from '../types.ts'

let root: string
let db: Db
let server: Server
let baseUrl: string
let adminCookie: string
let basicCookie: string
let started: AgentRunKind[]
let children: FakeChild[]

const recordingRunner: RunnerSpawner = (kind) => {
  started.push(kind)
  const fake = fakeChild()
  children.push(fake)
  return fake.child
}

async function listen(runner: RunnerSpawner): Promise<void> {
  server = createApp(db, join(root, 'uploads'), { runner }).listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  baseUrl = `http://localhost:${port}`
  adminCookie = await loginAs(baseUrl, 'admin-user', 'admin-password')
  basicCookie = await loginAs(baseUrl, 'basic-user', 'basic-password')
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'job-app-test-'))
  db = openDatabase(join(root, 'app.db'))
  seedUser(db, 'admin-user', 'admin-password')
  createUser(db, 'basic-user', 'basic-password')
  started = []
  children = []
  await listen(recordingRunner)
})

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  db.close()
  rmSync(root, { recursive: true, force: true })
})

function post(body: string, cookie = adminCookie): Promise<Response> {
  return fetch(`${baseUrl}/api/agent/runs`, {
    method: 'POST',
    headers: { ...JSON_TYPE, Cookie: cookie },
    body,
  })
}

async function list(): Promise<AgentRuns> {
  const res = await fetch(`${baseUrl}/api/agent/runs`, { headers: { Cookie: adminCookie } })
  expect(res.status).toBe(200)
  return (await res.json()) as AgentRuns
}

const JSON_TYPE = { 'Content-Type': 'application/json' }
const ROUTES = [
  { method: 'GET', headers: {}, body: undefined },
  { method: 'POST', headers: JSON_TYPE, body: '{"kind":"collect"}' },
]

test.each(ROUTES)('$method without a session is 401', async ({ method, headers, body }) => {
  const res = await fetch(`${baseUrl}/api/agent/runs`, { method, headers, body })
  expect(res.status).toBe(401)
})

test.each(ROUTES)('$method as a basic user is 403', async ({ method, headers, body }) => {
  const res = await fetch(`${baseUrl}/api/agent/runs`, { method, headers: { ...headers, Cookie: basicCookie }, body })
  expect(res.status).toBe(403)
  expect(started).toEqual([])
})

test.each([
  ['{}', 'kind must be one of: run, collect'],
  ['{"kind":"deploy"}', 'kind must be one of: run, collect'],
  ['{"kind":["run"]}', 'kind must be one of: run, collect'],
  ['["run"]', 'request body must be a JSON object'],
])('%s is 400 and starts nothing', async (body, error) => {
  const res = await post(body)

  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({ error, requestId: expect.any(String) })
  expect(started).toEqual([])
})

test('a POST starts the run and answers 201 with it; GET shows it as current', async () => {
  const res = await post('{"kind":"run"}')

  expect(res.status).toBe(201)
  const run = (await res.json()) as AgentRun
  expect(run).toEqual({ id: expect.any(Number), kind: 'run', startedAt: expect.any(String), finishedAt: null, exitCode: null, output: '' })
  expect(started).toEqual(['run'])
  expect(await list()).toEqual({ current: run, recent: [] })
})

test('a second POST while one runs is 409, and the runner was called once', async () => {
  await post('{"kind":"collect"}')

  const res = await post('{"kind":"run"}')

  expect(res.status).toBe(409)
  expect(await res.json()).toEqual({ error: 'a run is already in progress', requestId: expect.any(String) })
  expect(started).toEqual(['collect'])
})

test('a finished run moves to recent, with its output and exit code', async () => {
  const run = (await (await post('{"kind":"collect"}')).json()) as AgentRun
  children[0].stdout.write('collected 3 ads\n')

  await children[0].close(0)

  expect(await list()).toEqual({
    current: null,
    recent: [{ ...run, finishedAt: expect.any(String), exitCode: 0, output: 'collected 3 ads\n' }],
  })
})

test('recent holds the last 10 finished runs, newest first', async () => {
  const ids: number[] = []
  for (let i = 0; i < 11; i++) {
    ids.push(((await (await post('{"kind":"collect"}')).json()) as AgentRun).id)
    await children[i].close(0)
  }

  expect((await list()).recent.map((run) => run.id)).toEqual(ids.slice(1).reverse())
})

test('no request field reaches the spawned argv or env', async () => {
  const calls: Parameters<SpawnFn>[] = []
  const spawn: SpawnFn = (...args) => {
    calls.push(args)
    return fakeChild().child as ChildProcess
  }
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await listen(createRunnerSpawner(spawn, '/runner-root', { PATH: '/bin', DB_PATH: '/data/app.db' }))

  const res = await post(
    JSON.stringify({ kind: 'collect', argv: ['-e', 'evil()'], env: { NODE_OPTIONS: '--require evil' }, cwd: '/tmp' }),
  )

  expect(res.status).toBe(201)
  expect(calls).toEqual([
    [
      process.execPath,
      ['agent/runner/commands/collect.ts'],
      { cwd: '/runner-root', env: { PATH: '/bin' }, shell: false, stdio: ['ignore', 'pipe', 'pipe'] },
    ],
  ])
})

test('an app without a runner has no run routes', async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  server = createApp(db, join(root, 'uploads')).listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0

  const res = await fetch(`http://localhost:${port}/api/agent/runs`, { headers: { Cookie: adminCookie } })

  expect(res.status).toBe(404)
})
