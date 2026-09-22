// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { openDatabase } from '../db/index.ts'
import { createApp } from '../app.ts'
import { createUser, seedUser } from '../lib/seed.ts'
import { loginAs } from '../test/auth.ts'
import type { Application, Attachment, User } from '../types.ts'

const ROUTES = [
  { method: 'GET', path: '/api/users' },
  { method: 'POST', path: '/api/users' },
  { method: 'PUT', path: '/api/users/1/role' },
  { method: 'PUT', path: '/api/users/1/password' },
  { method: 'DELETE', path: '/api/users/1' },
]

let root: string
let uploadsDir: string
let server: Server
let baseUrl: string
let adminId: number
let basicId: number
let adminCookie: string
let basicCookie: string

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'job-app-test-'))
  uploadsDir = join(root, 'uploads')
  const db = openDatabase(join(root, 'app.db'))
  adminId = seedUser(db, 'admin-user', 'admin-password')
  basicId = createUser(db, 'basic-user', 'basic-password')
  const app = createApp(db, uploadsDir)
  server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  baseUrl = `http://localhost:${port}`
  adminCookie = await loginAs(baseUrl, 'admin-user', 'admin-password')
  basicCookie = await loginAs(baseUrl, 'basic-user', 'basic-password')
})

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  rmSync(root, { recursive: true, force: true })
})

function post(body: unknown, cookie: string): Promise<Response> {
  return fetch(`${baseUrl}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  })
}

function put(path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify(body),
  })
}

async function createApplicationWithAttachment(cookie: string): Promise<Attachment> {
  const applicationRes = await fetch(`${baseUrl}/api/applications`, {
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
  const application = (await applicationRes.json()) as Application

  const form = new FormData()
  form.append('file', new Blob(['hello resume'], { type: 'text/plain' }), 'resume.txt')
  const uploadRes = await fetch(
    `${baseUrl}/api/applications/${application.id}/attachments`,
    { method: 'POST', headers: { Cookie: cookie }, body: form },
  )
  return (await uploadRes.json()) as Attachment
}

test('every user route is 401 without a session', async () => {
  for (const route of ROUTES) {
    const res = await fetch(`${baseUrl}${route.path}`, { method: route.method })
    expect(res.status, `${route.method} ${route.path}`).toBe(401)
  }
})

test('every user route is 403 for a basic user', async () => {
  for (const route of ROUTES) {
    const res = await fetch(`${baseUrl}${route.path}`, {
      method: route.method,
      headers: { Cookie: basicCookie },
    })
    expect(res.status, `${route.method} ${route.path}`).toBe(403)
  }
})

test('creating a user lists it with the role it was given', async () => {
  const createRes = await post(
    { username: 'new-admin', password: 'new-password', role: 'admin' },
    adminCookie,
  )
  expect(createRes.status).toBe(201)
  const created = (await createRes.json()) as User
  expect(created.username).toBe('new-admin')
  expect(created.role).toBe('admin')

  const listRes = await fetch(`${baseUrl}/api/users`, { headers: { Cookie: adminCookie } })
  expect(listRes.status).toBe(200)
  const users = (await listRes.json()) as User[]
  expect(users.map((user) => user.username)).toEqual([
    'admin-user',
    'basic-user',
    'new-admin',
  ])
  expect(users.map((user) => user.role)).toEqual(['admin', 'basic', 'admin'])
})

test('a new user can log in with the password it was created with', async () => {
  await post({ username: 'new-user', password: 'new-password', role: 'basic' }, adminCookie)

  const cookie = await loginAs(baseUrl, 'new-user', 'new-password')
  const meRes = await fetch(`${baseUrl}/api/me`, { headers: { Cookie: cookie } })
  expect(meRes.status).toBe(200)
})

test('a taken username is refused', async () => {
  const res = await post(
    { username: 'basic-user', password: 'new-password', role: 'basic' },
    adminCookie,
  )
  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({ error: 'username taken' })
})

test('a missing username, an empty password and an unknown role are refused', async () => {
  const noUsername = await post({ password: 'pw', role: 'basic' }, adminCookie)
  const noPassword = await post({ username: 'x', password: '', role: 'basic' }, adminCookie)
  const badRole = await post({ username: 'x', password: 'pw', role: 'root' }, adminCookie)

  expect(noUsername.status).toBe(400)
  expect(noPassword.status).toBe(400)
  expect(badRole.status).toBe(400)
})

test('a role can be changed', async () => {
  const res = await put(`/api/users/${basicId}/role`, { role: 'admin' })
  expect(res.status).toBe(200)
  expect(((await res.json()) as User).role).toBe('admin')

  const meRes = await fetch(`${baseUrl}/api/me`, { headers: { Cookie: basicCookie } })
  expect(((await meRes.json()) as User).role).toBe('admin')
})

test('an unknown role is refused and an unknown user is 404', async () => {
  const badRole = await put(`/api/users/${basicId}/role`, { role: 'root' })
  expect(badRole.status).toBe(400)

  const unknownUser = await put('/api/users/999/role', { role: 'basic' })
  expect(unknownUser.status).toBe(404)
})

test('demoting the last admin is refused', async () => {
  const res = await put(`/api/users/${adminId}/role`, { role: 'basic' })
  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({ error: 'cannot demote the last admin' })

  await put(`/api/users/${basicId}/role`, { role: 'admin' })
  const withTwoAdmins = await put(`/api/users/${adminId}/role`, { role: 'basic' })
  expect(withTwoAdmins.status).toBe(200)
})

test('a password can be reset, and the old one stops working', async () => {
  const res = await put(`/api/users/${basicId}/password`, { password: 'reset-password' })
  expect(res.status).toBe(200)
  expect(((await res.json()) as User).username).toBe('basic-user')

  const withNew = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'basic-user', password: 'reset-password' }),
  })
  expect(withNew.status).toBe(200)

  const withOld = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'basic-user', password: 'basic-password' }),
  })
  expect(withOld.status).toBe(401)
})

test('a password reset logs the user out of the sessions they already had', async () => {
  const before = await fetch(`${baseUrl}/api/me`, { headers: { Cookie: basicCookie } })
  expect(before.status).toBe(200)

  await put(`/api/users/${basicId}/password`, { password: 'reset-password' })

  const after = await fetch(`${baseUrl}/api/me`, { headers: { Cookie: basicCookie } })
  expect(after.status).toBe(401)
})

test('an empty password is refused and an unknown user is 404', async () => {
  const empty = await put(`/api/users/${basicId}/password`, { password: '' })
  expect(empty.status).toBe(400)

  const unknownUser = await put('/api/users/999/password', { password: 'pw' })
  expect(unknownUser.status).toBe(404)
})

test('deleting yourself is refused', async () => {
  const res = await fetch(`${baseUrl}/api/users/${adminId}`, {
    method: 'DELETE',
    headers: { Cookie: adminCookie },
  })
  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({ error: 'cannot delete yourself' })
})

test('deleting an unknown user is 404', async () => {
  const res = await fetch(`${baseUrl}/api/users/999`, {
    method: 'DELETE',
    headers: { Cookie: adminCookie },
  })
  expect(res.status).toBe(404)
})

test("deleting a user takes their applications, attachments and files with it", async () => {
  const doomed = await createApplicationWithAttachment(basicCookie)
  const kept = await createApplicationWithAttachment(adminCookie)

  const res = await fetch(`${baseUrl}/api/users/${basicId}`, {
    method: 'DELETE',
    headers: { Cookie: adminCookie },
  })
  expect(res.status).toBe(204)

  expect(existsSync(join(uploadsDir, doomed.storedName))).toBe(false)
  expect(existsSync(join(uploadsDir, kept.storedName))).toBe(true)

  const meRes = await fetch(`${baseUrl}/api/me`, { headers: { Cookie: basicCookie } })
  expect(meRes.status).toBe(401)

  const listRes = await fetch(`${baseUrl}/api/users`, { headers: { Cookie: adminCookie } })
  const users = (await listRes.json()) as User[]
  expect(users.map((user) => user.username)).toEqual(['admin-user'])

  const applicationsRes = await fetch(`${baseUrl}/api/applications`, {
    headers: { Cookie: adminCookie },
  })
  const applications = (await applicationsRes.json()) as Application[]
  expect(applications).toHaveLength(1)
  expect(applications[0].attachments).toHaveLength(1)
})
