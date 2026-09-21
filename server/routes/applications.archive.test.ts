// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { openDatabase } from '../db/index.ts'
import { createApp } from '../app.ts'
import { createUser } from '../lib/seed.ts'
import { loginAs } from '../test/auth.ts'
import type { Application } from '../types.ts'

let root: string
let server: Server
let baseUrl: string
let cookie: string

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'job-app-test-'))
  const dbPath = join(root, 'app.db')
  const uploadsDir = join(root, 'uploads')
  const db = openDatabase(dbPath)
  createUser(db, 'testuser', 'test-password')
  createUser(db, 'otheruser', 'other-password')
  const app = createApp(db, uploadsDir)
  server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  baseUrl = `http://localhost:${port}`
  cookie = await loginAs(baseUrl, 'testuser', 'test-password')
})

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  rmSync(root, { recursive: true, force: true })
})

async function createApplication(sessionCookie = cookie): Promise<Application> {
  const res = await fetch(`${baseUrl}/api/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({
      company: 'Acme',
      role: 'Engineer',
      dateApplied: '2026-01-15',
      status: 'rejected',
    }),
  })
  return (await res.json()) as Application
}

function setArchived(id: number, archived: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/applications/${id}/archived`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ archived }),
  })
}

test('a newly created application is not archived', async () => {
  const created = await createApplication()
  expect(created.archived).toBe(false)
})

test('archiving and unarchiving round-trips and survives a re-read of the list', async () => {
  const created = await createApplication()

  const archived = (await (await setArchived(created.id, true)).json()) as Application
  expect(archived.archived).toBe(true)

  const listed = (await (
    await fetch(`${baseUrl}/api/applications`, { headers: { Cookie: cookie } })
  ).json()) as Application[]
  expect(listed[0].archived).toBe(true)

  const unarchived = (await (await setArchived(created.id, false)).json()) as Application
  expect(unarchived.archived).toBe(false)
})

test('archiving leaves updatedAt where it was', async () => {
  const created = await createApplication()
  const db = openDatabase(join(root, 'app.db'))
  db.prepare("UPDATE applications SET updated_at = '2020-01-01 00:00:00' WHERE id = ?").run(
    created.id,
  )

  const archived = (await (await setArchived(created.id, true)).json()) as Application
  expect(archived.updatedAt).toBe('2020-01-01 00:00:00')
})

test('archiving leaves the status untouched', async () => {
  const created = await createApplication()

  const archived = (await (await setArchived(created.id, true)).json()) as Application
  expect(archived.status).toBe('rejected')
})

test('rejects a non-boolean archived with 400', async () => {
  const created = await createApplication()

  expect((await setArchived(created.id, 'yes')).status).toBe(400)
})

test('a request with no body is a 400', async () => {
  const created = await createApplication()

  const res = await fetch(`${baseUrl}/api/applications/${created.id}/archived`, {
    method: 'PUT',
    headers: { Cookie: cookie },
  })
  expect(res.status).toBe(400)
})

test('an unknown application is a 404', async () => {
  expect((await setArchived(9999, true)).status).toBe(404)
})

test("another user's application is a 404", async () => {
  const otherCookie = await loginAs(baseUrl, 'otheruser', 'other-password')
  const theirs = await createApplication(otherCookie)

  expect((await setArchived(theirs.id, true)).status).toBe(404)
})
