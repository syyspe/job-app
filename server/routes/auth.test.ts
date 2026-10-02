// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database as Db } from 'better-sqlite3'
import type { Server } from 'node:http'
import { openDatabase } from '../db/index.ts'
import { createApp } from '../app.ts'
import { createUser } from '../lib/seed.ts'
import type { User } from '../types.ts'

let root: string
let server: Server
let baseUrl: string
let db: Db

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'job-app-test-'))
  const dbPath = join(root, 'app.db')
  const uploadsDir = join(root, 'uploads')
  db = openDatabase(dbPath)
  createUser(db, 'testuser', 'test-password')
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

test('login sets an httpOnly cookie and returns the user', async () => {
  const res = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'testuser', password: 'test-password' }),
  })
  expect(res.status).toBe(200)
  const user = (await res.json()) as User
  expect(user.username).toBe('testuser')
  const setCookie = res.headers.get('set-cookie')
  expect(setCookie).toContain('HttpOnly')
})

test('a wrong password and an unknown username give the same 401', async () => {
  const wrongPassword = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'testuser', password: 'nope' }),
  })
  const unknownUser = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'ghost', password: 'nope' }),
  })
  expect(wrongPassword.status).toBe(401)
  expect(unknownUser.status).toBe(401)
  expect(await wrongPassword.json()).toEqual(await unknownUser.json())
})

test('/me returns the user with the cookie and 401 without', async () => {
  const loginRes = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'testuser', password: 'test-password' }),
  })
  const cookie = loginRes.headers.get('set-cookie')!.split(';')[0]

  const withCookie = await fetch(`${baseUrl}/api/me`, { headers: { Cookie: cookie } })
  expect(withCookie.status).toBe(200)
  const user = (await withCookie.json()) as User
  expect(user.username).toBe('testuser')
  expect(user.role).toBe('basic')

  const withoutCookie = await fetch(`${baseUrl}/api/me`)
  expect(withoutCookie.status).toBe(401)
})

test('logout clears the session so the cookie stops working', async () => {
  const loginRes = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'testuser', password: 'test-password' }),
  })
  const cookie = loginRes.headers.get('set-cookie')!.split(';')[0]

  const logoutRes = await fetch(`${baseUrl}/api/logout`, {
    method: 'POST',
    headers: { Cookie: cookie },
  })
  expect(logoutRes.status).toBe(204)

  const afterLogout = await fetch(`${baseUrl}/api/me`, { headers: { Cookie: cookie } })
  expect(afterLogout.status).toBe(401)
})

test('a form-urlencoded login is refused as an unsupported content type', async () => {
  const res = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'username=testuser&password=test-password',
  })
  expect(res.status).toBe(415)
  expect((await res.json()) as { error: string }).toEqual({
    error: 'unsupported content type: application/x-www-form-urlencoded',
  })
})

test('a text/plain login is refused as an unsupported content type', async () => {
  const res = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: 'testuser',
  })
  expect(res.status).toBe(415)
})

test('a login with no body at all is a failed credentials check', async () => {
  const res = await fetch(`${baseUrl}/api/login`, { method: 'POST' })
  expect(res.status).toBe(401)
  expect(await res.json()).toEqual({ error: 'invalid credentials' })
})

test('a login whose body is null is a 400 from the parser', async () => {
  const res = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'null',
  })
  expect(res.status).toBe(400)
})

test('a login whose body is malformed JSON answers the parser message', async () => {
  const res = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{bad',
  })
  expect(res.status).toBe(400)
  // The exact text comes from JSON.parse and moves with V8; what matters is
  // that it is the parser's message and not the generic 500 body.
  expect(((await res.json()) as { error: string }).error).toMatch(/JSON/)
})

test('/me answers 401 when the session points at a deleted user', async () => {
  const loginRes = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'testuser', password: 'test-password' }),
  })
  const cookie = loginRes.headers.get('set-cookie')!.split(';')[0]
  // sessions.user_id cascades on delete, so an orphan session only exists if
  // the row went out of band — which is the state this answers 401 for.
  db.pragma('foreign_keys = OFF')
  db.prepare(`DELETE FROM users WHERE username = 'testuser'`).run()
  db.pragma('foreign_keys = ON')

  const res = await fetch(`${baseUrl}/api/me`, { headers: { Cookie: cookie } })
  expect(res.status).toBe(401)
  expect(await res.json()).toEqual({ error: 'unauthorized' })
})
