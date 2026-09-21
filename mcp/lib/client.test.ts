// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import type Database from 'better-sqlite3'
import { openDatabase } from '../../server/db/index.ts'
import { createApp } from '../../server/app.ts'
import { createUser } from '../../server/lib/seed.ts'
import { createApiClient } from './client.ts'
import type { ApiClient } from './client.ts'

let root: string
let server: Server
let baseUrl: string
let db: Database.Database
let client: ApiClient

function countSessions(): number {
  const row = db.prepare('SELECT count(*) AS n FROM sessions').get() as { n: number }
  return row.n
}

async function listenOnEphemeralPort(app: ReturnType<typeof createApp>): Promise<Server> {
  const listening = app.listen(0)
  await new Promise<void>((resolve) => listening.once('listening', resolve))
  return listening
}

function urlOf(listening: Server): string {
  const address = listening.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return `http://localhost:${port}`
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'job-app-mcp-'))
  db = openDatabase(join(root, 'app.db'))
  createUser(db, 'testuser', 'test-password')
  server = await listenOnEphemeralPort(createApp(db, join(root, 'uploads')))
  baseUrl = urlOf(server)
  client = createApiClient({ baseUrl, username: 'testuser', password: 'test-password' })
})

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  rmSync(root, { recursive: true, force: true })
})

test('logs in on the first call and reuses the cookie on the next', async () => {
  expect(countSessions()).toBe(0)

  await client.getJson('/api/applications')
  await client.getJson('/api/applications')

  expect(countSessions()).toBe(1)
})

test('logs in again when the session has gone away', async () => {
  await client.getJson('/api/applications')
  db.prepare('DELETE FROM sessions').run()

  await expect(client.getJson('/api/applications')).resolves.toEqual([])
  expect(countSessions()).toBe(1)
})

test('bad credentials name the env vars to check', async () => {
  const wrong = createApiClient({ baseUrl, username: 'testuser', password: 'nope' })

  await expect(wrong.getJson('/api/applications')).rejects.toThrow(
    /login failed for user testuser.*JOBAPP_USERNAME\/JOBAPP_PASSWORD/,
  )
})

test('an unreachable API says it may not be running', async () => {
  const spare = await listenOnEphemeralPort(createApp(db, join(root, 'uploads')))
  const closedUrl = urlOf(spare)
  await new Promise<void>((resolve) => spare.close(() => resolve()))
  const offline = createApiClient({
    baseUrl: closedUrl,
    username: 'testuser',
    password: 'test-password',
  })

  await expect(offline.getJson('/api/applications')).rejects.toThrow(
    `cannot reach the job-applications API at ${closedUrl} — is it running? (npm run dev:server)`,
  )
})

test("a rejected request carries the server's own error string", async () => {
  await expect(client.sendJson('POST', '/api/applications', { company: '' })).rejects.toThrow(
    'invalid application',
  )
})
