// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { openDatabase } from '../db/index.ts'
import { createApp } from '../app.ts'
import { createUser } from '../lib/seed.ts'
import type { User } from '../types.ts'

let root: string
let server: Server
let baseUrl: string

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
