// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import type Database from 'better-sqlite3'
import { openDatabase } from '../db/index.ts'
import { createApp } from '../app.ts'
import { createUser } from '../lib/seed.ts'
import { loginAs } from '../test/auth.ts'
import type { Application, Attachment } from '../types.ts'

let root: string
let uploadsDir: string
let db: Database.Database
let server: Server
let baseUrl: string
let cookie: string

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'job-app-text-test-'))
  uploadsDir = join(root, 'uploads')
  db = openDatabase(join(root, 'app.db'))
  createUser(db, 'testuser', 'test-password')
  server = createApp(db, uploadsDir).listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  baseUrl = `http://localhost:${port}`
  cookie = await loginAs(baseUrl, 'testuser', 'test-password')
})

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  db.close()
  rmSync(root, { recursive: true, force: true })
})

async function createApplication(): Promise<Application> {
  const res = await fetch(`${baseUrl}/api/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ company: 'Acme', role: 'Engineer', dateApplied: '2026-01-01', status: 'draft' }),
  })
  return (await res.json()) as Application
}

async function upload(applicationId: number, name: string, text: string): Promise<Attachment> {
  const form = new FormData()
  form.append('file', new Blob([text], { type: 'text/markdown' }), name)
  const res = await fetch(`${baseUrl}/api/applications/${applicationId}/attachments`, {
    method: 'POST',
    headers: { Cookie: cookie },
    body: form,
  })
  return (await res.json()) as Attachment
}

function saveText(id: number, body: unknown, sessionCookie = cookie): Promise<Response> {
  return fetch(`${baseUrl}/api/attachments/${id}/text`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify(body),
  })
}

function storedText(attachment: Attachment): string {
  return readFileSync(join(uploadsDir, attachment.storedName), 'utf8')
}

function updatedAt(applicationId: number): string {
  const row = db.prepare('SELECT updated_at FROM applications WHERE id = ?').get(applicationId)
  return (row as { updated_at: string }).updated_at
}

test('saving an original creates an "(edited)" copy and leaves the original untouched', async () => {
  const application = await createApplication()
  const original = await upload(application.id, 'Hakemus_Acme_FI.md', 'Hei [[ASK:q1]]')

  const res = await saveText(original.id, { text: 'Hei maailma' })

  expect(res.status).toBe(200)
  const copy = (await res.json()) as Attachment
  expect(copy).toMatchObject({
    applicationId: application.id,
    originalName: 'Hakemus_Acme_FI (edited).md',
    mimeType: 'text/markdown',
    editedFromId: original.id,
  })
  expect(copy.id).not.toBe(original.id)
  expect(storedText(copy)).toBe('Hei maailma')
  expect(storedText(original)).toBe('Hei [[ASK:q1]]')
})

test('saving the copy overwrites it in place and unlinks the replaced file', async () => {
  const original = await upload((await createApplication()).id, 'CV.MD', 'v1')
  const first = (await (await saveText(original.id, { text: 'v2' })).json()) as Attachment

  const res = await saveText(first.id, { text: 'v3' })

  const second = (await res.json()) as Attachment
  expect(second.id).toBe(first.id)
  expect(second.originalName).toBe('CV (edited).md')
  expect(second.storedName).not.toBe(first.storedName)
  expect(storedText(second)).toBe('v3')
  expect(existsSync(join(uploadsDir, first.storedName))).toBe(false)
})

test('the profile mark moves from the original to the copy', async () => {
  const original = await upload((await createApplication()).id, 'CV.md', 'v1')
  db.prepare('UPDATE attachments SET profile_sync = 1 WHERE id = ?').run(original.id)

  const copy = (await (await saveText(original.id, { text: 'v2' })).json()) as Attachment

  expect(copy.profileSyncPending).toBe(true)
  const row = db.prepare('SELECT profile_sync FROM attachments WHERE id = ?').get(original.id)
  expect(row).toEqual({ profile_sync: 0 })
})

test('saving text moves the parent application\'s updatedAt', async () => {
  const application = await createApplication()
  const original = await upload(application.id, 'CV.md', 'v1')
  db.prepare("UPDATE applications SET updated_at = '2020-01-01 00:00:00' WHERE id = ?").run(application.id)

  await saveText(original.id, { text: 'v2' })

  expect(updatedAt(application.id)).not.toBe('2020-01-01 00:00:00')
})

test('saving an original that already has a copy is a 409', async () => {
  const original = await upload((await createApplication()).id, 'CV.md', 'v1')
  await saveText(original.id, { text: 'v2' })

  const res = await saveText(original.id, { text: 'v3' })

  expect(res.status).toBe(409)
  expect(await res.json()).toMatchObject({
    error: 'attachment has an edited copy; edit that instead',
    requestId: expect.any(String),
  })
})

test('a non-.md attachment is not editable', async () => {
  const pdf = await upload((await createApplication()).id, 'report.pdf', '%PDF')

  const res = await saveText(pdf.id, { text: 'x' })

  expect(res.status).toBe(400)
  expect(await res.json()).toMatchObject({ error: 'only .md attachments can be edited' })
})

test('text that is not a string is rejected', async () => {
  const original = await upload((await createApplication()).id, 'CV.md', 'v1')

  const res = await saveText(original.id, { text: 7 })

  expect(res.status).toBe(400)
  expect(await res.json()).toMatchObject({ error: 'text must be a string' })
})

test('an unknown attachment, or another user\'s, is a 404', async () => {
  const original = await upload((await createApplication()).id, 'CV.md', 'v1')
  createUser(db, 'other', 'password')
  const otherCookie = await loginAs(baseUrl, 'other', 'password')

  const unknown = await saveText(999999, { text: 'x' })
  const foreign = await saveText(original.id, { text: 'x' }, otherCookie)

  expect(unknown.status).toBe(404)
  expect(foreign.status).toBe(404)
  expect(await foreign.json()).toMatchObject({ error: 'not found' })
  expect(storedText(original)).toBe('v1')
})

test('a body over the JSON limit is a 413', async () => {
  const original = await upload((await createApplication()).id, 'CV.md', 'v1')

  const res = await saveText(original.id, { text: 'x'.repeat(200 * 1024) })

  expect(res.status).toBe(413)
  expect(await res.json()).toMatchObject({ requestId: expect.any(String) })
})
