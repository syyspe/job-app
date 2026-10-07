// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import express from 'express'
import type { Server } from 'node:http'
import { requestLogging } from './requestLogging.ts'
import { createLogger } from '../lib/logger.ts'

let server: Server
let baseUrl: string
let lines: string[]

beforeEach(async () => {
  lines = []
  const app = express()
  app.use(requestLogging(createLogger('info', (line) => lines.push(line))))
  app.get('/ping', (_req, res) => {
    res.status(201).send('pong')
  })
  server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  baseUrl = `http://localhost:${port}`
})

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

test('each response carries its own UUID request ID', async () => {
  const first = await fetch(`${baseUrl}/ping`)
  const second = await fetch(`${baseUrl}/ping`)

  const firstId = first.headers.get('X-Request-Id')
  const secondId = second.headers.get('X-Request-Id')
  expect(firstId).toMatch(UUID)
  expect(secondId).toMatch(UUID)
  expect(firstId).not.toBe(secondId)
})

test('an incoming request ID is ignored', async () => {
  const res = await fetch(`${baseUrl}/ping`, { headers: { 'X-Request-Id': 'chosen-by-caller' } })

  expect(res.headers.get('X-Request-Id')).toMatch(UUID)
})

test('a finished request writes one line with its method, path, status and duration', async () => {
  const res = await fetch(`${baseUrl}/ping?secret=1`)
  await res.text()
  await new Promise((resolve) => setImmediate(resolve))

  const finished = lines.map((line) => JSON.parse(line)).filter((entry) => entry.msg === 'request finished')
  expect(finished).toHaveLength(1)
  expect(finished[0]).toMatchObject({
    level: 'info',
    method: 'GET',
    path: '/ping',
    status: 201,
    durationMs: expect.any(Number),
    requestId: res.headers.get('X-Request-Id'),
  })
})
