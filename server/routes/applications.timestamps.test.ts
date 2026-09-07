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

test('a deadline is accepted when missing, when empty, and for a non-draft status', async () => {
  const missing = await fetch(`${baseUrl}/api/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ company: 'Acme', role: 'Engineer', dateApplied: '', status: 'draft' }),
  })
  expect(missing.status).toBe(201)
  expect(((await missing.json()) as Application).deadline).toBe('')

  const empty = await fetch(`${baseUrl}/api/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      company: 'Acme',
      role: 'Engineer',
      dateApplied: '',
      deadline: '',
      status: 'draft',
    }),
  })
  expect(empty.status).toBe(201)

  const nonDraft = await fetch(`${baseUrl}/api/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      company: 'Acme',
      role: 'Engineer',
      dateApplied: '2026-01-01',
      deadline: '2026-02-01',
      status: 'applied',
    }),
  })
  expect(nonDraft.status).toBe(201)
  expect(((await nonDraft.json()) as Application).deadline).toBe('2026-02-01')
})

test('rejects a non-string deadline with 400', async () => {
  const res = await fetch(`${baseUrl}/api/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      company: 'Acme',
      role: 'Engineer',
      dateApplied: '',
      deadline: 12345,
      status: 'draft',
    }),
  })
  expect(res.status).toBe(400)
})

test('sets createdAt and updatedAt to the same value on create, ignoring any client-supplied ones', async () => {
  const res = await fetch(`${baseUrl}/api/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      company: 'Acme',
      role: 'Engineer',
      dateApplied: '',
      status: 'draft',
      createdAt: '1999-01-01 00:00:00',
      updatedAt: '1999-01-01 00:00:00',
    }),
  })
  const created = (await res.json()) as Application
  expect(created.createdAt).toBe(created.updatedAt)
  expect(created.createdAt).not.toBe('1999-01-01 00:00:00')
})

test('a PUT with a changed field moves updatedAt and leaves createdAt, ignoring client-supplied timestamps', async () => {
  const createRes = await fetch(`${baseUrl}/api/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ company: 'Acme', role: 'Engineer', dateApplied: '', status: 'draft' }),
  })
  const created = (await createRes.json()) as Application

  const db = openDatabase(join(root, 'app.db'))
  db.prepare(
    "UPDATE applications SET created_at = '2020-01-01 00:00:00', updated_at = '2020-01-01 00:00:00' WHERE id = ?",
  ).run(created.id)

  const updateRes = await fetch(`${baseUrl}/api/applications/${created.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      company: 'Acme',
      role: 'Senior Engineer',
      dateApplied: '',
      status: 'draft',
      createdAt: '1999-01-01 00:00:00',
      updatedAt: '1999-01-01 00:00:00',
    }),
  })
  const updated = (await updateRes.json()) as Application
  expect(updated.createdAt).toBe('2020-01-01 00:00:00')
  expect(updated.updatedAt).not.toBe('2020-01-01 00:00:00')
  expect(updated.updatedAt).not.toBe('1999-01-01 00:00:00')
})

test('a PUT with every field identical to the stored row moves neither timestamp', async () => {
  const createRes = await fetch(`${baseUrl}/api/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      company: 'Acme',
      role: 'Engineer',
      dateApplied: '2026-01-01',
      deadline: '2026-02-01',
      status: 'applied',
      link: '',
      notes: '',
    }),
  })
  const created = (await createRes.json()) as Application

  const db = openDatabase(join(root, 'app.db'))
  db.prepare(
    "UPDATE applications SET created_at = '2020-01-01 00:00:00', updated_at = '2020-01-01 00:00:00' WHERE id = ?",
  ).run(created.id)

  const updateRes = await fetch(`${baseUrl}/api/applications/${created.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      company: 'Acme',
      role: 'Engineer',
      dateApplied: '2026-01-01',
      deadline: '2026-02-01',
      status: 'applied',
      link: '',
      notes: '',
    }),
  })
  const updated = (await updateRes.json()) as Application
  expect(updated.createdAt).toBe('2020-01-01 00:00:00')
  expect(updated.updatedAt).toBe('2020-01-01 00:00:00')
})
