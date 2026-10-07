// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import express from 'express'
import multer from 'multer'
import type { RequestHandler } from 'express'
import type { Server } from 'node:http'
import { jsonErrorHandler } from './errors.ts'
import { requestLogging } from './requestLogging.ts'
import { HttpError } from '../lib/httpError.ts'
import { createLogger } from '../lib/logger.ts'

let server: Server
let baseUrl: string
let lines: string[]
let escaped: ReturnType<typeof vi.spyOn>

async function serveThrowing(error: Error): Promise<void> {
  await serve(() => {
    throw error
  })
}

async function serve(route: RequestHandler): Promise<void> {
  const app = express()
  // Under 'test' Express's fallback handler stays silent; this makes anything
  // escaping jsonErrorHandler show up as a console.error call.
  app.set('env', 'production')
  app.use(requestLogging(createLogger('info', (line) => lines.push(line))))
  app.get('/boom', route)
  app.use(jsonErrorHandler)
  server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  baseUrl = `http://localhost:${port}`
}

function failures(): Record<string, unknown>[] {
  return lines.map((line) => JSON.parse(line)).filter((entry) => entry.msg === 'request failed')
}

beforeEach(() => {
  lines = []
  escaped = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  expect(escaped).not.toHaveBeenCalled()
  vi.restoreAllMocks()
})

test('an HttpError answers its own status and message, with the request ID', async () => {
  await serveThrowing(new HttpError(415, 'unsupported content type: text/plain'))

  const res = await fetch(`${baseUrl}/boom`)
  const requestId = res.headers.get('X-Request-Id')
  expect(res.status).toBe(415)
  expect(await res.json()).toEqual({ error: 'unsupported content type: text/plain', requestId })
  expect(failures()).toEqual([
    expect.objectContaining({
      level: 'info',
      status: 415,
      error: 'unsupported content type: text/plain',
      requestId,
    }),
  ])
  expect(failures()[0]).not.toHaveProperty('err')
})

test('a MulterError answers 400 with its message', async () => {
  const error = new multer.MulterError('LIMIT_FILE_SIZE')
  await serveThrowing(error)

  const res = await fetch(`${baseUrl}/boom`)
  expect(res.status).toBe(400)
  expect(await res.json()).toMatchObject({ error: error.message })
})

test("an error carrying a 400 status answers the parser's own message", async () => {
  const error = Object.assign(new Error('Unexpected end of JSON input'), { status: 400 })
  await serveThrowing(error)

  const res = await fetch(`${baseUrl}/boom`)
  expect(res.status).toBe(400)
  expect(await res.json()).toMatchObject({ error: 'Unexpected end of JSON input' })
})

test("a body parse error answers the parser's message but keeps the body out of the log", async () => {
  const message = `Unexpected token 'h', ..."password":hunter2}" is not valid JSON`
  await serveThrowing(Object.assign(new Error(message), { status: 400, type: 'entity.parse.failed' }))

  const res = await fetch(`${baseUrl}/boom`)
  expect(res.status).toBe(400)
  expect(await res.json()).toMatchObject({ error: message })
  expect(failures()).toEqual([expect.objectContaining({ status: 400, error: 'malformed JSON body' })])
  expect(lines.join('')).not.toContain('hunter2')
})

test('a plain Error answers a generic 500 and logs one error line with stack and cause', async () => {
  const cause = Object.assign(new Error('no such file'), { code: 'ENOENT' })
  await serveThrowing(new Error('column widget does not exist', { cause }))

  const res = await fetch(`${baseUrl}/boom`)
  const requestId = res.headers.get('X-Request-Id')
  expect(res.status).toBe(500)
  expect(await res.json()).toEqual({ error: 'internal server error', requestId })

  const errorLines = lines.map((line) => JSON.parse(line)).filter((entry) => entry.level === 'error')
  expect(errorLines).toHaveLength(1)
  const [line] = errorLines
  expect(line).toMatchObject({ msg: 'request failed', status: 500, requestId })
  expect(line.err).toContain('Error: column widget does not exist\n    at ')
  expect(line.err).toContain('[cause]: Error: no such file')
  expect(line.err).toContain("code: 'ENOENT'")
})

test('an error after the response has started cuts the transfer off, logged once', async () => {
  await serve((_req, res) => {
    res.write('partial')
    throw new Error('read failed mid-stream')
  })

  await expect(fetch(`${baseUrl}/boom`).then((res) => res.text())).rejects.toThrow()
  expect(failures()).toEqual([
    expect.objectContaining({ level: 'error', error: 'read failed mid-stream' }),
  ])
})
