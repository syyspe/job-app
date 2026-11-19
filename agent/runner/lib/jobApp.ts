import { z } from 'zod'
import { CliError } from '../../lib/cliError.ts'
import type { JobAppEnv } from './env.ts'

// The env file the credentials came from, named when a login is rejected.
export interface JobAppConfig extends JobAppEnv {
  envPath: string
}

export interface PendingAttachment {
  id: number
  originalName: string
}

const adSummaryShape = {
  id: z.number(),
  sourceMode: z.enum(['automatic', 'handover']),
  title: z.string(),
  company: z.string(),
  location: z.string(),
  deadline: z.string(),
  url: z.string(),
  state: z.string(),
  attempts: z.number(),
}
const adSummarySchema = z.object(adSummaryShape)
const adSchema = z.object({ ...adSummaryShape, body: z.string().nullable() })

// Only the fields the runner reads; the API sends more.
export type AdSummary = z.infer<typeof adSummarySchema>
export type Ad = z.infer<typeof adSchema>

export interface AdTransition {
  to: string
  evaluation?: { verdict: string; fitSummary: string; reasons: string[] }
  error?: string
}

export interface JobAppClient {
  listPendingSync: () => Promise<PendingAttachment[]>
  downloadAttachment: (id: number) => Promise<Uint8Array>
  setProfileSync: (id: number, pending: boolean) => Promise<void>
  listAds: (state: string) => Promise<AdSummary[]>
  getAd: (id: number) => Promise<Ad>
  transitionAd: (id: number, transition: AdTransition) => Promise<AdSummary>
}

interface JobAppRequest {
  method: 'GET' | 'POST' | 'PUT'
  path: string
  body?: unknown
}

const pendingSchema = z.array(z.object({ id: z.number(), originalName: z.string() }))
const errorSchema = z.object({ error: z.string() })

async function fetchJobApp(config: JobAppConfig, request: JobAppRequest, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = cookie ? { Cookie: cookie } : {}
  if (request.body !== undefined) headers['Content-Type'] = 'application/json'
  try {
    return await fetch(`${config.baseUrl}${request.path}`, {
      method: request.method,
      headers,
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
    })
  } catch (err) {
    // fetch rejects with a TypeError when the request itself fails.
    if (!(err instanceof TypeError)) throw err
    throw new CliError(1, `cannot reach job-app at ${config.baseUrl}`, { cause: err })
  }
}

async function failure(request: JobAppRequest, response: Response): Promise<CliError> {
  const parsed = errorSchema.safeParse(await response.json().catch(() => undefined))
  const detail = parsed.success ? parsed.data.error : response.statusText
  return new CliError(1, `job-app ${request.method} ${request.path}: ${response.status} ${detail}`)
}

async function login(config: JobAppConfig): Promise<string> {
  const { username, password } = config
  const request: JobAppRequest = { method: 'POST', path: '/api/login', body: { username, password } }
  const response = await fetchJobApp(config, request)
  if (response.status === 401) {
    throw new CliError(1, `job-app login failed: check JOBAPP_USERNAME and JOBAPP_PASSWORD in ${config.envPath}`)
  }
  if (!response.ok) throw await failure(request, response)
  return (response.headers.get('set-cookie') ?? '').split(';')[0]
}

type Sender = (request: JobAppRequest) => Promise<Response>

// Logs in on first use and once more when the session has expired.
function createSender(config: JobAppConfig): Sender {
  let cookie: string | undefined
  async function attempt(request: JobAppRequest): Promise<Response> {
    cookie ??= await login(config)
    return fetchJobApp(config, request, cookie)
  }
  return async (request) => {
    let response = await attempt(request)
    if (response.status === 401) {
      cookie = undefined
      response = await attempt(request)
    }
    if (!response.ok) throw await failure(request, response)
    return response
  }
}

async function receive<T>(send: Sender, request: JobAppRequest, schema: z.ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await (await send(request)).json().catch(() => undefined))
  if (!parsed.success) throw new CliError(1, `job-app ${request.method} ${request.path}: bad response`)
  return parsed.data
}

export function createJobAppClient(config: JobAppConfig): JobAppClient {
  const send = createSender(config)
  return {
    listPendingSync: () => receive(send, { method: 'GET', path: '/api/attachments/pending-sync' }, pendingSchema),
    downloadAttachment: async (id) => {
      const response = await send({ method: 'GET', path: `/api/attachments/${id}` })
      return new Uint8Array(await response.arrayBuffer())
    },
    setProfileSync: async (id, pending) => {
      await send({ method: 'PUT', path: `/api/attachments/${id}/profile-sync`, body: { pending } })
    },
    listAds: (state) => receive(send, { method: 'GET', path: `/api/ads?state=${state}` }, z.array(adSummarySchema)),
    getAd: (id) => receive(send, { method: 'GET', path: `/api/ads/${id}` }, adSchema),
    transitionAd: (id, transition) =>
      receive(send, { method: 'POST', path: `/api/ads/${id}/transition`, body: transition }, adSummarySchema),
  }
}
