// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import type Database from 'better-sqlite3'
import { openDatabase } from '../db/index.ts'
import { createApp } from '../app.ts'
import { createUser } from '../lib/seed.ts'
import { loginAs } from '../test/auth.ts'
import type { Application, Attachment } from '../types.ts'

const NOTES = 'Fits well.\n\nOpen questions:\nq1: Why Acme?\nq2: When can you start?\n\nsource: x'

let root: string
let uploadsDir: string
let db: Database.Database
let server: Server
let baseUrl: string
let cookie: string

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'job-app-questions-test-'))
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

async function createApplication(notes = NOTES): Promise<Application> {
  const res = await fetch(`${baseUrl}/api/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ company: 'Acme', role: 'Engineer', dateApplied: '2026-01-01', status: 'draft', notes }),
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

function getQuestions(applicationId: number, sessionCookie = cookie): Promise<Response> {
  return fetch(`${baseUrl}/api/applications/${applicationId}/questions`, {
    headers: { Cookie: sessionCookie },
  })
}

function postAnswers(applicationId: number, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/applications/${applicationId}/answers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  })
}

function rows(applicationId: number): Attachment[] {
  return (
    db.prepare('SELECT * FROM attachments WHERE application_id = ? ORDER BY id').all(applicationId) as {
      id: number
      stored_name: string
      original_name: string
      profile_sync: number
      edited_from: number | null
    }[]
  ).map((row) => ({
    id: row.id,
    applicationId,
    storedName: row.stored_name,
    originalName: row.original_name,
    mimeType: '',
    uploadedAt: '',
    profileSyncPending: row.profile_sync === 1,
    editedFromId: row.edited_from,
  }))
}

function storedText(attachment: Attachment): string {
  return readFileSync(join(uploadsDir, attachment.storedName), 'utf8')
}

function applicationRow(id: number): { notes: string; updated_at: string } {
  return db.prepare('SELECT notes, updated_at FROM applications WHERE id = ?').get(id) as {
    notes: string
    updated_at: string
  }
}

async function draft(): Promise<{ application: Application; letter: Attachment; cv: Attachment }> {
  const application = await createApplication()
  const letter = await upload(application.id, 'Hakemus_Acme_FI.md', 'Hei. [[ASK:q1]] Aloitan [[ASK:q2]].')
  const cv = await upload(application.id, 'CV_Acme_FI.md', 'Kokemus: [[ASK:q1]]')
  await upload(application.id, 'ad.txt', '[[ASK:q9]]')
  return { application, letter, cv }
}

test('GET lists the open questions over the .md documents, with their texts from the notes', async () => {
  const { application } = await draft()

  const res = await getQuestions(application.id)

  expect(res.status).toBe(200)
  expect(await res.json()).toEqual([
    { id: 'q1', text: 'Why Acme?' },
    { id: 'q2', text: 'When can you start?' },
  ])
})

test('a question whose notes line is gone has a null text', async () => {
  const application = await createApplication('No questions here')
  await upload(application.id, 'Letter.md', '[[ASK:q3]]')

  expect(await (await getQuestions(application.id)).json()).toEqual([{ id: 'q3', text: null }])
})

test('a document whose file is missing is skipped', async () => {
  const { application, letter } = await draft()
  unlinkSync(join(uploadsDir, letter.storedName))

  expect(await (await getQuestions(application.id)).json()).toEqual([{ id: 'q1', text: 'Why Acme?' }])
})

test('once a copy exists, the original\'s markers no longer count', async () => {
  const { application, letter } = await draft()
  await fetch(`${baseUrl}/api/attachments/${letter.id}/text`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ text: 'Rewritten without markers' }),
  })

  expect(await (await getQuestions(application.id)).json()).toEqual([{ id: 'q1', text: 'Why Acme?' }])
})

test('POST fills the answered marker in every document, keeps the rest open and the originals intact', async () => {
  const { application, letter, cv } = await draft()

  const res = await postAnswers(application.id, { answers: { q1: '  Great product  ', q2: '   ' } })

  expect(res.status).toBe(200)
  expect(await res.json()).toEqual([{ id: 'q2', text: 'When can you start?' }])
  const [, , , letterCopy, cvCopy] = rows(application.id)
  expect(letterCopy).toMatchObject({ originalName: 'Hakemus_Acme_FI (edited).md', editedFromId: letter.id })
  expect(cvCopy).toMatchObject({ originalName: 'CV_Acme_FI (edited).md', editedFromId: cv.id })
  expect(storedText(letterCopy)).toBe('Hei. Great product Aloitan [[ASK:q2]].')
  expect(storedText(cvCopy)).toBe('Kokemus: Great product')
  expect(storedText(letter)).toBe('Hei. [[ASK:q1]] Aloitan [[ASK:q2]].')
  expect(storedText(cv)).toBe('Kokemus: [[ASK:q1]]')
  expect(applicationRow(application.id).notes).toBe(
    'Fits well.\n\nOpen questions:\nq1: Why Acme?\n→ Great product\nq2: When can you start?\n\nsource: x',
  )
})

test('a second POST overwrites the same copy and unlinks its old file', async () => {
  const { application } = await draft()
  await postAnswers(application.id, { answers: { q1: 'Great product' } })
  const before = rows(application.id)[3]

  await postAnswers(application.id, { answers: { q2: 'In May' } })

  const after = rows(application.id)[3]
  expect(after.id).toBe(before.id)
  expect(after.storedName).not.toBe(before.storedName)
  expect(storedText(after)).toBe('Hei. Great product Aloitan In May.')
  expect(existsSync(join(uploadsDir, before.storedName))).toBe(false)
  expect(rows(application.id)).toHaveLength(5)
  expect(await (await getQuestions(application.id)).json()).toEqual([])
})

test('answering moves the profile mark to the copy and bumps updatedAt', async () => {
  const { application, cv } = await draft()
  db.prepare('UPDATE attachments SET profile_sync = 1 WHERE id = ?').run(cv.id)
  db.prepare("UPDATE applications SET updated_at = '2020-01-01 00:00:00' WHERE id = ?").run(application.id)

  await postAnswers(application.id, { answers: { q1: 'Great product' } })

  const all = rows(application.id)
  expect(all.find((row) => row.id === cv.id)?.profileSyncPending).toBe(false)
  expect(all.find((row) => row.editedFromId === cv.id)?.profileSyncPending).toBe(true)
  expect(applicationRow(application.id).updated_at).not.toBe('2020-01-01 00:00:00')
})

test('an answer to a question that is not open is a 409 and writes nothing', async () => {
  const { application } = await draft()

  const res = await postAnswers(application.id, { answers: { q1: 'Great product', q3: 'x' } })

  expect(res.status).toBe(409)
  expect(await res.json()).toMatchObject({ error: 'q3 is not an open question', requestId: expect.any(String) })
  expect(rows(application.id)).toHaveLength(3)
  expect(applicationRow(application.id).notes).toBe(NOTES)
})

test('answers that are not an object of strings are rejected', async () => {
  const { application } = await draft()

  for (const answers of [undefined, 'q1', ['a'], { q1: 7 }]) {
    const res = await postAnswers(application.id, { answers })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'answers must be an object of strings' })
  }
})

test('an unknown or another user\'s application is a 404', async () => {
  const { application } = await draft()
  createUser(db, 'other', 'password')
  const otherCookie = await loginAs(baseUrl, 'other', 'password')

  const foreign = await getQuestions(application.id, otherCookie)
  const unknown = await postAnswers(999999, { answers: {} })

  expect(foreign.status).toBe(404)
  expect(await foreign.json()).toMatchObject({ error: 'application not found' })
  expect(unknown.status).toBe(404)
})

test('a failure mid-write is a 500 that rolls back the rows and keeps the old files', async () => {
  const { application } = await draft()
  await postAnswers(application.id, { answers: { q1: 'Great product' } })
  const before = rows(application.id)
  db.exec(`CREATE TRIGGER fail_notes BEFORE UPDATE OF notes ON applications
           BEGIN SELECT RAISE(ABORT, 'boom'); END`)

  const res = await postAnswers(application.id, { answers: { q2: 'In May' } })

  expect(res.status).toBe(500)
  expect(await res.json()).toMatchObject({ error: 'internal server error' })
  expect(rows(application.id)).toEqual(before)
  expect(storedText(before[3])).toBe('Hei. Great product Aloitan [[ASK:q2]].')
  expect(applicationRow(application.id).notes).toContain('→ Great product\nq2:')
})
