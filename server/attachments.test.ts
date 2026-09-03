// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { openDatabase } from './db.ts'
import { createApp } from './app.ts'
import type { Application, Attachment } from './types.ts'

let root: string
let uploadsDir: string
let server: Server
let baseUrl: string

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'job-app-test-'))
  const dbPath = join(root, 'app.db')
  uploadsDir = join(root, 'uploads')
  const db = openDatabase(dbPath)
  const app = createApp(db, uploadsDir)
  server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  baseUrl = `http://localhost:${port}`
})

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  rmSync(root, { recursive: true, force: true })
})

async function createApplication(): Promise<Application> {
  const res = await fetch(`${baseUrl}/api/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    { method: 'POST', body: resumeFile() },
  )
  expect(uploadRes.status).toBe(201)
  const attachment = (await uploadRes.json()) as Attachment
  expect(attachment.originalName).toBe('resume.txt')
  expect(existsSync(join(uploadsDir, attachment.storedName))).toBe(
    true,
  )

  const listRes = await fetch(`${baseUrl}/api/applications`)
  const [listed] = (await listRes.json()) as Application[]
  expect(listed.attachments).toHaveLength(1)
  expect(listed.attachments[0].id).toBe(attachment.id)

  const downloadRes = await fetch(`${baseUrl}/api/attachments/${attachment.id}`)
  expect(downloadRes.status).toBe(200)
  expect(downloadRes.headers.get('content-disposition')).toContain(
    'resume.txt',
  )
  expect(await downloadRes.text()).toBe('hello resume')
})

test('removing an attachment clears its row and its file', async () => {
  const application = await createApplication()
  const uploadRes = await fetch(
    `${baseUrl}/api/applications/${application.id}/attachments`,
    { method: 'POST', body: resumeFile() },
  )
  const attachment = (await uploadRes.json()) as Attachment
  const storedPath = join(uploadsDir, attachment.storedName)
  expect(existsSync(storedPath)).toBe(true)

  const deleteRes = await fetch(`${baseUrl}/api/attachments/${attachment.id}`, {
    method: 'DELETE',
  })
  expect(deleteRes.status).toBe(204)
  expect(existsSync(storedPath)).toBe(false)

  const listRes = await fetch(`${baseUrl}/api/applications`)
  const [listed] = (await listRes.json()) as Application[]
  expect(listed.attachments).toEqual([])
})

test('deleting the application removes its attachment files from disk', async () => {
  const application = await createApplication()
  const uploadRes = await fetch(
    `${baseUrl}/api/applications/${application.id}/attachments`,
    { method: 'POST', body: resumeFile() },
  )
  const attachment = (await uploadRes.json()) as Attachment
  const storedPath = join(uploadsDir, attachment.storedName)
  expect(existsSync(storedPath)).toBe(true)

  const deleteRes = await fetch(
    `${baseUrl}/api/applications/${application.id}`,
    { method: 'DELETE' },
  )
  expect(deleteRes.status).toBe(204)
  expect(existsSync(storedPath)).toBe(false)
})

test('uploading to an unknown application is rejected and leaves no file behind', async () => {
  const uploadRes = await fetch(`${baseUrl}/api/applications/999999/attachments`, {
    method: 'POST',
    body: resumeFile(),
  })
  expect(uploadRes.status).toBe(404)
  expect(existsSync(uploadsDir)).toBe(false)
})
