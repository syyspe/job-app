import { afterEach, beforeEach, expect } from 'vitest'
import type Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { openDatabase } from '../db/index.ts'
import { createApp } from '../app.ts'
import { createUser } from '../lib/seed.ts'
import { loginAs } from './auth.ts'
import type { Ad, AdState } from '../types.ts'

export let db: Database.Database
export let baseUrl: string
export let cookie: string
export let otherCookie: string
export let uploadsDir: string

let root: string
let server: Server
let nextKey = 0

/** Runs a real app on an ephemeral port around each test in the calling file. */
export function withAdsApi(): void {
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'job-app-ads-'))
    db = openDatabase(join(root, 'app.db'))
    createUser(db, 'testuser', 'test-password')
    createUser(db, 'otheruser', 'other-password')
    uploadsDir = join(root, 'uploads')
    server = createApp(db, uploadsDir).listen(0)
    await new Promise<void>((resolve) => server.once('listening', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    baseUrl = `http://localhost:${port}`
    cookie = await loginAs(baseUrl, 'testuser', 'test-password')
    otherCookie = await loginAs(baseUrl, 'otheruser', 'other-password')
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    db.close()
    rmSync(root, { recursive: true, force: true })
  })
}

export function post(path: string, body: unknown, sessionCookie = cookie): Promise<Response> {
  return fetch(`${baseUrl}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify(body),
  })
}

export function get(path: string, sessionCookie = cookie): Promise<Response> {
  return fetch(`${baseUrl}/api${path}`, { headers: { Cookie: sessionCookie } })
}

export function adFields(overrides: Record<string, unknown> = {}) {
  nextKey += 1
  return {
    source: 'testsource',
    sourceMode: 'automatic',
    url: `https://jobs.example.com/ad/${nextKey}`,
    title: `Engineer ${nextKey}`,
    company: `Company ${nextKey}`,
    ...overrides,
  }
}

export async function ingest(overrides: Record<string, unknown> = {}): Promise<Ad> {
  const res = await post('/ads', adFields(overrides))
  return (await res.json()) as Ad
}

export function transition(id: number, body: unknown): Promise<Response> {
  return post(`/ads/${id}/transition`, body)
}

export async function moved(id: number, body: unknown): Promise<Ad> {
  const res = await transition(id, body)
  expect(res.status).toBe(200)
  return (await res.json()) as Ad
}

export async function readAd(id: number): Promise<Ad> {
  return (await (await get(`/ads/${id}`)).json()) as Ad
}

export async function readyAd(overrides: Record<string, unknown> = {}): Promise<Ad> {
  const ad = await ingest(overrides)
  return moved(ad.id, { to: 'ready', body: 'The ad text.' })
}

export function evaluation(verdict: AdState) {
  return { verdict, fitSummary: 'A good fit.', reasons: ['Relevant experience'] }
}

export async function createApplication(fields: Record<string, unknown> = {}): Promise<number> {
  const res = await post('/applications', {
    company: 'Acme',
    role: 'Engineer',
    dateApplied: '2026-01-15',
    status: 'applied',
    ...fields,
  })
  return ((await res.json()) as { id: number }).id
}
