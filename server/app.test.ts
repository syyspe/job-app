// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { openDatabase } from './db.ts'
import { createApp } from './app.ts'

let root: string
let staticDir: string
let server: Server
let baseUrl: string

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'job-app-static-test-'))
  staticDir = join(root, 'static')
  const dbPath = join(root, 'app.db')
  const uploadsDir = join(root, 'uploads')

  mkdirSync(staticDir)
  writeFileSync(join(staticDir, 'index.html'), '<html>index</html>')
  writeFileSync(join(staticDir, 'asset.css'), 'body { color: red }')

  const db = openDatabase(dbPath)
  const app = createApp(db, uploadsDir, { staticDir })
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

test('serves a static asset from staticDir', async () => {
  const res = await fetch(`${baseUrl}/asset.css`)
  expect(res.status).toBe(200)
  expect(await res.text()).toBe('body { color: red }')
})

test('falls back to index.html for an unknown non-api route', async () => {
  const res = await fetch(`${baseUrl}/some/deep/route`)
  expect(res.status).toBe(200)
  expect(await res.text()).toBe('<html>index</html>')
})

test('does not swallow an unmatched /api route into the SPA fallback', async () => {
  const res = await fetch(`${baseUrl}/api/does-not-exist`)
  expect(res.status).toBe(404)
  expect(await res.text()).not.toBe('<html>index</html>')
})
