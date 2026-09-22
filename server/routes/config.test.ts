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
import type { AppConfig } from '../types.ts'

let root: string
let server: Server
let baseUrl: string
let cookie: string

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'job-app-test-'))
  const db = openDatabase(join(root, 'app.db'))
  createUser(db, 'testuser', 'test-password')
  const app = createApp(db, join(root, 'uploads'), { pageSize: 3 })
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

test('the config reports the page size the app was given', async () => {
  const res = await fetch(`${baseUrl}/api/config`, { headers: { Cookie: cookie } })
  expect(res.status).toBe(200)
  const config = (await res.json()) as AppConfig
  expect(config.pageSize).toBe(3)
})

test('the config needs a session', async () => {
  const res = await fetch(`${baseUrl}/api/config`)
  expect(res.status).toBe(401)
})
