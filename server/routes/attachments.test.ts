// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { openDatabase } from '../db/index.ts'
import { createApp } from '../app.ts'
import { createUser } from '../lib/seed.ts'
import { loginAs } from '../test/auth.ts'
import type { Application, Attachment } from '../types.ts'

let root: string
let uploadsDir: string
let server: Server
let baseUrl: string
let cookie: string

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'job-app-test-'))
  const dbPath = join(root, 'app.db')
  uploadsDir = join(root, 'uploads')
  const db = openDatabase(dbPath)
  createUser(db, 'testuser', 'test-password')
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

async function createApplication(): Promise<Application> {
  const res = await fetch(`${baseUrl}/api/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      company: 'Acme',
      role: 'Engineer',
      dateApplied: '2026-01-01',
      status: 'applied',
      link: '',
      notes: '',
    }),
  })
  return (await res.json()) as Application
}

async function uploadResume(applicationId: number): Promise<Attachment> {
  const res = await fetch(`${baseUrl}/api/applications/${applicationId}/attachments`, {
    method: 'POST',
    headers: { Cookie: cookie },
    body: resumeFile(),
  })
  return (await res.json()) as Attachment
}

function replaceAttachment(id: number, body: FormData, sessionCookie = cookie) {
  return fetch(`${baseUrl}/api/attachments/${id}`, {
    method: 'PUT',
    headers: { Cookie: sessionCookie },
    body,
  })
}

function newCvFile(): FormData {
  const form = new FormData()
  form.append('file', new Blob(['%PDF new cv'], { type: 'application/pdf' }), 'cv-2026.pdf')
  return form
}

function resumeFile(): FormData {
  const form = new FormData()
  form.append(
    'file',
    new Blob(['hello resume'], { type: 'text/plain' }),
    'resume.txt',
  )
  return form
}

test('uploading a file attaches it to the application and can be downloaded back', async () => {
  const application = await createApplication()

  const uploadRes = await fetch(
    `${baseUrl}/api/applications/${application.id}/attachments`,
    { method: 'POST', headers: { Cookie: cookie }, body: resumeFile() },
  )
  expect(uploadRes.status).toBe(201)
  const attachment = (await uploadRes.json()) as Attachment
  expect(attachment.originalName).toBe('resume.txt')
  expect(attachment.uploadedAt).not.toBe('')
  expect(existsSync(join(uploadsDir, attachment.storedName))).toBe(
    true,
  )

  const listRes = await fetch(`${baseUrl}/api/applications`, { headers: { Cookie: cookie } })
  const [listed] = (await listRes.json()) as Application[]
  expect(listed.attachments).toHaveLength(1)
  expect(listed.attachments[0].id).toBe(attachment.id)

  const downloadRes = await fetch(`${baseUrl}/api/attachments/${attachment.id}`, {
    headers: { Cookie: cookie },
  })
  expect(downloadRes.status).toBe(200)
  expect(downloadRes.headers.get('content-disposition')).toContain(
    'resume.txt',
  )
  expect(await downloadRes.text()).toBe('hello resume')
})

test('uploading an attachment moves the parent application\'s updatedAt', async () => {
  const application = await createApplication()
  const db = openDatabase(join(root, 'app.db'))
  db.prepare(
    "UPDATE applications SET updated_at = '2020-01-01 00:00:00' WHERE id = ?",
  ).run(application.id)

  await fetch(`${baseUrl}/api/applications/${application.id}/attachments`, {
    method: 'POST',
    headers: { Cookie: cookie },
    body: resumeFile(),
  })

  const listRes = await fetch(`${baseUrl}/api/applications`, { headers: { Cookie: cookie } })
  const [listed] = (await listRes.json()) as Application[]
  expect(listed.updatedAt).not.toBe('2020-01-01 00:00:00')
})

test('removing an attachment moves the parent application\'s updatedAt', async () => {
  const application = await createApplication()
  const uploadRes = await fetch(
    `${baseUrl}/api/applications/${application.id}/attachments`,
    { method: 'POST', headers: { Cookie: cookie }, body: resumeFile() },
  )
  const attachment = (await uploadRes.json()) as Attachment

  const db = openDatabase(join(root, 'app.db'))
  db.prepare(
    "UPDATE applications SET updated_at = '2020-01-01 00:00:00' WHERE id = ?",
  ).run(application.id)

  await fetch(`${baseUrl}/api/attachments/${attachment.id}`, {
    method: 'DELETE',
    headers: { Cookie: cookie },
  })

  const listRes = await fetch(`${baseUrl}/api/applications`, { headers: { Cookie: cookie } })
  const [listed] = (await listRes.json()) as Application[]
  expect(listed.updatedAt).not.toBe('2020-01-01 00:00:00')
})

test('downloading an attachment does not move the parent application\'s updatedAt', async () => {
  const application = await createApplication()
  const uploadRes = await fetch(
    `${baseUrl}/api/applications/${application.id}/attachments`,
    { method: 'POST', headers: { Cookie: cookie }, body: resumeFile() },
  )
  const attachment = (await uploadRes.json()) as Attachment

  const db = openDatabase(join(root, 'app.db'))
  db.prepare(
    "UPDATE applications SET updated_at = '2020-01-01 00:00:00' WHERE id = ?",
  ).run(application.id)

  await fetch(`${baseUrl}/api/attachments/${attachment.id}`, { headers: { Cookie: cookie } })

  const listRes = await fetch(`${baseUrl}/api/applications`, { headers: { Cookie: cookie } })
  const [listed] = (await listRes.json()) as Application[]
  expect(listed.updatedAt).toBe('2020-01-01 00:00:00')
})

test('removing an attachment clears its row and its file', async () => {
  const application = await createApplication()
  const uploadRes = await fetch(
    `${baseUrl}/api/applications/${application.id}/attachments`,
    { method: 'POST', headers: { Cookie: cookie }, body: resumeFile() },
  )
  const attachment = (await uploadRes.json()) as Attachment
  const storedPath = join(uploadsDir, attachment.storedName)
  expect(existsSync(storedPath)).toBe(true)

  const deleteRes = await fetch(`${baseUrl}/api/attachments/${attachment.id}`, {
    method: 'DELETE',
    headers: { Cookie: cookie },
  })
  expect(deleteRes.status).toBe(204)
  expect(existsSync(storedPath)).toBe(false)

  const listRes = await fetch(`${baseUrl}/api/applications`, { headers: { Cookie: cookie } })
  const [listed] = (await listRes.json()) as Application[]
  expect(listed.attachments).toEqual([])
})

test('deleting the application removes its attachment files from disk', async () => {
  const application = await createApplication()
  const uploadRes = await fetch(
    `${baseUrl}/api/applications/${application.id}/attachments`,
    { method: 'POST', headers: { Cookie: cookie }, body: resumeFile() },
  )
  const attachment = (await uploadRes.json()) as Attachment
  const storedPath = join(uploadsDir, attachment.storedName)
  expect(existsSync(storedPath)).toBe(true)

  const deleteRes = await fetch(
    `${baseUrl}/api/applications/${application.id}`,
    { method: 'DELETE', headers: { Cookie: cookie } },
  )
  expect(deleteRes.status).toBe(204)
  expect(existsSync(storedPath)).toBe(false)
})

test('uploading to an unknown application is rejected and leaves no file behind', async () => {
  const uploadRes = await fetch(`${baseUrl}/api/applications/999999/attachments`, {
    method: 'POST',
    headers: { Cookie: cookie },
    body: resumeFile(),
  })
  expect(uploadRes.status).toBe(404)
  expect(existsSync(uploadsDir)).toBe(false)
})

test('a second user cannot upload to, download, replace, or delete the first user\'s attachment', async () => {
  const application = await createApplication()
  const uploadRes = await fetch(
    `${baseUrl}/api/applications/${application.id}/attachments`,
    { method: 'POST', headers: { Cookie: cookie }, body: resumeFile() },
  )
  const attachment = (await uploadRes.json()) as Attachment

  const db = openDatabase(join(root, 'app.db'))
  createUser(db, 'other', 'password')
  const otherCookie = await loginAs(baseUrl, 'other', 'password')

  const uploadToOthers = await fetch(
    `${baseUrl}/api/applications/${application.id}/attachments`,
    { method: 'POST', headers: { Cookie: otherCookie }, body: resumeFile() },
  )
  expect(uploadToOthers.status).toBe(404)

  const downloadRes = await fetch(`${baseUrl}/api/attachments/${attachment.id}`, {
    headers: { Cookie: otherCookie },
  })
  expect(downloadRes.status).toBe(404)

  const deleteRes = await fetch(`${baseUrl}/api/attachments/${attachment.id}`, {
    method: 'DELETE',
    headers: { Cookie: otherCookie },
  })
  expect(deleteRes.status).toBe(404)

  const replaceRes = await replaceAttachment(attachment.id, newCvFile(), otherCookie)
  expect(replaceRes.status).toBe(404)

  const deleteApplicationRes = await fetch(`${baseUrl}/api/applications/${application.id}`, {
    method: 'DELETE',
    headers: { Cookie: otherCookie },
  })
  expect(deleteApplicationRes.status).toBe(404)
})

test('replacing an attachment swaps its file in place and keeps its id', async () => {
  const application = await createApplication()
  const original = await uploadResume(application.id)
  const db = openDatabase(join(root, 'app.db'))
  db.prepare("UPDATE attachments SET uploaded_at = '2020-01-01 00:00:00' WHERE id = ?").run(
    original.id,
  )

  const replaceRes = await replaceAttachment(original.id, newCvFile())
  expect(replaceRes.status).toBe(200)
  const replaced = (await replaceRes.json()) as Attachment
  expect(replaced.id).toBe(original.id)
  expect(replaced.originalName).toBe('cv-2026.pdf')
  expect(replaced.mimeType).toBe('application/pdf')
  expect(replaced.storedName).not.toBe(original.storedName)
  expect(replaced.uploadedAt).not.toBe('2020-01-01 00:00:00')
  expect(existsSync(join(uploadsDir, original.storedName))).toBe(false)

  const downloadRes = await fetch(`${baseUrl}/api/attachments/${original.id}`, {
    headers: { Cookie: cookie },
  })
  expect(await downloadRes.text()).toBe('%PDF new cv')
})

test('replacing an attachment moves the parent application\'s updatedAt', async () => {
  const application = await createApplication()
  const attachment = await uploadResume(application.id)
  const db = openDatabase(join(root, 'app.db'))
  db.prepare(
    "UPDATE applications SET updated_at = '2020-01-01 00:00:00' WHERE id = ?",
  ).run(application.id)

  await replaceAttachment(attachment.id, newCvFile())

  const listRes = await fetch(`${baseUrl}/api/applications`, { headers: { Cookie: cookie } })
  const [listed] = (await listRes.json()) as Application[]
  expect(listed.updatedAt).not.toBe('2020-01-01 00:00:00')
})

test('replacing an attachment without a file is rejected', async () => {
  const application = await createApplication()
  const attachment = await uploadResume(application.id)

  const replaceRes = await replaceAttachment(attachment.id, new FormData())
  expect(replaceRes.status).toBe(400)
})

test('replacing an unknown attachment is rejected and leaves no file behind', async () => {
  const replaceRes = await replaceAttachment(999999, newCvFile())
  expect(replaceRes.status).toBe(404)
  expect(existsSync(uploadsDir)).toBe(false)
})
