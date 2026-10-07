// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import express from 'express'
import multer from 'multer'
import type { RequestHandler } from 'express'
import type { Server } from 'node:http'
import { jsonErrorHandler } from './errors.ts'
import { HttpError } from '../lib/httpError.ts'

let server: Server
let baseUrl: string
let logged: ReturnType<typeof vi.spyOn>

async function serveThrowing(error: Error): Promise<void> {
  await serve(() => {
    throw error
  })
}

async function serve(route: RequestHandler): Promise<void> {
  const app = express()
  // Under 'test' Express's fallback handler stays silent; this makes anything
  // escaping jsonErrorHandler show up as an extra console.error call.
  app.set('env', 'production')
  app.get('/boom', route)
  app.use(jsonErrorHandler)
  server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  baseUrl = `http://localhost:${port}`
}

beforeEach(() => {
  logged = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  vi.restoreAllMocks()
})

test('an HttpError answers its own status and message', async () => {
  await serveThrowing(new HttpError(415, 'unsupported content type: text/plain'))

  const res = await fetch(`${baseUrl}/boom`)
  expect(res.status).toBe(415)
  expect(await res.json()).toEqual({ error: 'unsupported content type: text/plain' })
  expect(logged).toHaveBeenCalledWith('GET /boom 415 unsupported content type: text/plain')
})

test('a MulterError answers 400 with its message', async () => {
  const error = new multer.MulterError('LIMIT_FILE_SIZE')
  await serveThrowing(error)

  const res = await fetch(`${baseUrl}/boom`)
  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({ error: error.message })
  expect(logged).toHaveBeenCalledWith(`GET /boom 400 ${error.message}`)
})

test("an error carrying a 400 status answers the parser's own message", async () => {
  const error = Object.assign(new Error('Unexpected end of JSON input'), { status: 400 })
  await serveThrowing(error)

  const res = await fetch(`${baseUrl}/boom`)
  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({ error: 'Unexpected end of JSON input' })
  expect(logged).toHaveBeenCalledWith('GET /boom 400 Unexpected end of JSON input')
})

test('a plain Error answers a generic 500 and logs the stack', async () => {
  const error = new Error('column widget does not exist')
  await serveThrowing(error)

  const res = await fetch(`${baseUrl}/boom`)
  expect(res.status).toBe(500)
  expect(await res.json()).toEqual({ error: 'internal server error' })
  expect(logged).toHaveBeenCalledWith('GET /boom 500 column widget does not exist')
  expect(logged).toHaveBeenCalledWith(error)
})

test('an error after the response has started cuts the transfer off, logged once', async () => {
  await serve((_req, res) => {
    res.write('partial')
    throw new Error('read failed mid-stream')
  })

  await expect(fetch(`${baseUrl}/boom`).then((res) => res.text())).rejects.toThrow()
  expect(logged).toHaveBeenCalledTimes(2)
  expect(logged).toHaveBeenNthCalledWith(1, 'GET /boom 500 read failed mid-stream')
})
