import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { answerAds } from './fakeJobAppAds.ts'
import { readJson, sendJson } from './fakeHttp.ts'
import type { FakeAd, FakeTransition } from './fakeJobAppAds.ts'

export interface FakeAttachment {
  id: number
  originalName: string
  content: string
  pending: boolean
}

export interface FakeJobApp {
  url: string
  username: string
  password: string
  attachments: FakeAttachment[]
  ads: FakeAd[]
  transitions: FakeTransition[]
  flagCalls: { id: number; pending: boolean }[]
  logins: number
  // 'status' answers the pending list with a 500; 'malformed' answers the ad
  // list with something that is not a list.
  failure: 'none' | 'status' | 'malformed'
  // Drops the current session, so the next request is answered 401.
  expireSession: () => void
  close: () => Promise<void>
}

function toAttachment({ id, originalName, pending }: FakeAttachment) {
  return { id, applicationId: 1, storedName: `${id}.bin`, originalName, mimeType: 'text/plain', uploadedAt: '', profileSyncPending: pending }
}

interface State {
  fake: FakeJobApp
  session: string | null
}

async function answerLogin(state: State, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { username, password } = await readJson(req)
  if (username !== state.fake.username || password !== state.fake.password) {
    return sendJson(res, 401, { error: 'invalid username or password' })
  }
  state.fake.logins += 1
  state.session = randomUUID()
  res.setHeader('set-cookie', `session=${state.session}; HttpOnly; Path=/`)
  sendJson(res, 200, { id: 1, username, role: 'basic' })
}

interface FlagTarget {
  fake: FakeJobApp
  attachment: FakeAttachment
}

async function answerFlag({ fake, attachment }: FlagTarget, req: IncomingMessage, res: ServerResponse) {
  const { pending } = await readJson(req)
  fake.flagCalls.push({ id: attachment.id, pending: pending as boolean })
  attachment.pending = pending as boolean
  sendJson(res, 200, toAttachment(attachment))
}

function answerAttachments(state: State, req: IncomingMessage, res: ServerResponse): void {
  const { fake } = state
  if (req.url === '/api/attachments/pending-sync') {
    if (fake.failure === 'status') return sendJson(res, 500, { error: 'internal server error' })
    return sendJson(res, 200, fake.attachments.filter((a) => a.pending).map(toAttachment))
  }
  const [, id, action] = /^\/api\/attachments\/(\d+)(\/profile-sync)?$/.exec(req.url ?? '') ?? []
  const attachment = fake.attachments.find((a) => a.id === Number(id))
  if (!attachment) return sendJson(res, 404, { error: 'not found' })
  if (action) return void answerFlag({ fake, attachment }, req, res)
  res.writeHead(200, { 'content-type': 'text/plain' }).end(attachment.content)
}

// An HTTP stand-in for the job-app endpoints the runner's client uses.
export async function startFakeJobApp(attachments: FakeAttachment[] = []): Promise<FakeJobApp> {
  const server = createServer((req, res) => {
    if (req.url === '/api/login' && req.method === 'POST') return void answerLogin(state, req, res)
    if (req.headers.cookie !== `session=${state.session}`) return sendJson(res, 401, { error: 'not logged in' })
    if (req.url?.startsWith('/api/ads')) return void answerAds(fake, req, res)
    answerAttachments(state, req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  const fake: FakeJobApp = {
    url: `http://127.0.0.1:${port}`,
    username: 'runner',
    password: 'runner-password',
    attachments,
    ads: [],
    transitions: [],
    flagCalls: [],
    logins: 0,
    failure: 'none',
    expireSession: () => {
      state.session = null
    },
    close: () => {
      server.closeAllConnections()
      return new Promise((resolve) => server.close(() => resolve()))
    },
  }
  const state: State = { fake, session: null }
  return fake
}
