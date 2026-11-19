import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const FAKE_DIMENSIONS = 64

// Port 1 is privileged, so no test server can be listening there: connecting
// is refused at once. Closing a fake and reusing its port would race with
// parallel test files binding port 0.
export const UNREACHABLE_URL = 'http://127.0.0.1:1'

export type EmbedFailure = 'none' | 'status' | 'malformed' | 'wrongCount' | 'hang'

export interface FakeOllama {
  url: string
  models: string[]
  embedRequests: number
  // Embed requests that still succeed before `failure` applies.
  failAfter: number
  failure: EmbedFailure
  tagsFailure: 'none' | 'status' | 'malformed' | 'hang'
  close: () => Promise<void>
}

// Deterministic stand-in for a real embedding: character trigrams hashed into
// FAKE_DIMENSIONS buckets and normalised, so texts sharing words score close.
export function fakeVector(text: string): number[] {
  const vector = new Array<number>(FAKE_DIMENSIONS).fill(0)
  const padded = ` ${text.toLowerCase()} `
  for (let i = 0; i + 3 <= padded.length; i++) {
    let hash = 0
    for (const char of padded.slice(i, i + 3)) hash = (hash * 31 + char.charCodeAt(0)) % 100003
    vector[hash % FAKE_DIMENSIONS] += 1
  }
  const norm = Math.hypot(...vector) || 1
  return vector.map((value) => value / norm)
}

async function readBody(req: IncomingMessage): Promise<{ input: string[] }> {
  const parts: Buffer[] = []
  for await (const part of req) parts.push(part as Buffer)
  return JSON.parse(Buffer.concat(parts).toString('utf8')) as { input: string[] }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
}

async function answerEmbed(fake: FakeOllama, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { input } = await readBody(req)
  fake.embedRequests += 1
  const failure = fake.embedRequests > fake.failAfter ? fake.failure : 'none'
  if (failure === 'hang') return
  if (failure === 'status') return sendJson(res, 500, { error: 'boom' })
  if (failure === 'malformed') return sendJson(res, 200, { embeddings: 'nope' })
  const embeddings = input.map(fakeVector)
  sendJson(res, 200, { embeddings: failure === 'wrongCount' ? embeddings.slice(1) : embeddings })
}

function answerTags(fake: FakeOllama, res: ServerResponse): void {
  if (fake.tagsFailure === 'hang') return
  if (fake.tagsFailure === 'status') return sendJson(res, 503, {})
  if (fake.tagsFailure === 'malformed') return sendJson(res, 200, { models: 'nope' })
  sendJson(res, 200, { models: fake.models.map((name) => ({ name })) })
}

export async function startFakeOllama(models: string[] = ['test-embed:latest']): Promise<FakeOllama> {
  const server = createServer((req, res) => {
    if (req.url === '/api/tags') return answerTags(fake, res)
    if (req.url === '/api/embed' && req.method === 'POST') return void answerEmbed(fake, req, res)
    sendJson(res, 404, {})
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  const fake: FakeOllama = {
    url: `http://127.0.0.1:${port}`,
    models,
    embedRequests: 0,
    failAfter: 0,
    failure: 'none',
    tagsFailure: 'none',
    close: () => {
      server.closeAllConnections()
      return new Promise((resolve) => server.close(() => resolve()))
    },
  }
  return fake
}
