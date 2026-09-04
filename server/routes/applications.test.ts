// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { openDatabase } from '../db/index.ts'
import { createApp } from '../app.ts'
import type { Application } from '../types.ts'

let root: string
let server: Server
let baseUrl: string

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'job-app-test-'))
  const dbPath = join(root, 'app.db')
  const uploadsDir = join(root, 'uploads')
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

test('create, list, update, delete round trip', async () => {
  const createRes = await fetch(`${baseUrl}/api/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      company: 'Acme',
      role: 'Engineer',
      dateApplied: '2026-01-01',
      status: 'applied',
      link: 'https://acme.example/jobs/1',
      notes: 'Referred by a friend',
    }),
  })
  expect(createRes.status).toBe(201)
  const created = (await createRes.json()) as Application
  expect(created.id).toBeTypeOf('number')
  expect(created.company).toBe('Acme')
  expect(created.attachments).toEqual([])

  const listRes = await fetch(`${baseUrl}/api/applications`)
  expect(listRes.status).toBe(200)
  const list = (await listRes.json()) as Application[]
  expect(list).toHaveLength(1)
  expect(list[0].id).toBe(created.id)

  const updateRes = await fetch(`${baseUrl}/api/applications/${created.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      company: 'Acme',
      role: 'Senior Engineer',
      dateApplied: '2026-01-01',
      status: 'interview',
      link: 'https://acme.example/jobs/1',
      notes: 'Passed phone screen',
    }),
  })
  expect(updateRes.status).toBe(200)
  const updated = (await updateRes.json()) as Application
  expect(updated.role).toBe('Senior Engineer')
  expect(updated.status).toBe('interview')

  const deleteRes = await fetch(`${baseUrl}/api/applications/${created.id}`, {
    method: 'DELETE',
  })
  expect(deleteRes.status).toBe(204)

  const afterDeleteRes = await fetch(`${baseUrl}/api/applications`)
  const afterDelete = await afterDeleteRes.json()
  expect(afterDelete).toEqual([])
})

test('rejects an invalid status with 400', async () => {
  const res = await fetch(`${baseUrl}/api/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      company: 'Acme',
      role: 'Engineer',
      dateApplied: '2026-01-01',
      status: 'not-a-real-status',
    }),
  })
  expect(res.status).toBe(400)
})

test('rejects an empty required field with 400', async () => {
  const res = await fetch(`${baseUrl}/api/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      company: '',
      role: 'Engineer',
      dateApplied: '2026-01-01',
      status: 'applied',
    }),
  })
  expect(res.status).toBe(400)
})

test('accepts a draft with no date', async () => {
  const res = await fetch(`${baseUrl}/api/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      company: 'Acme',
      role: 'Engineer',
      dateApplied: '',
      status: 'draft',
    }),
  })
  expect(res.status).toBe(201)
  const created = (await res.json()) as Application
  expect(created.dateApplied).toBe('')
})

test('rejects a non-draft with no date', async () => {
  const res = await fetch(`${baseUrl}/api/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      company: 'Acme',
      role: 'Engineer',
      dateApplied: '',
      status: 'applied',
    }),
  })
  expect(res.status).toBe(400)
})

test('returns 404 when updating an unknown id', async () => {
  const res = await fetch(`${baseUrl}/api/applications/999999`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      company: 'Acme',
      role: 'Engineer',
      dateApplied: '2026-01-01',
      status: 'applied',
    }),
  })
  expect(res.status).toBe(404)
})
