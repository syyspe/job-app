import { z } from 'zod'
import { CliError } from '../../lib/cliError.ts'
import type { JobAppEnv } from './env.ts'

// The env file the credentials came from, named when a login is rejected.
export interface JobAppConfig extends JobAppEnv {
  envPath: string
}

export interface PendingAttachment {
  id: number
  storedName: string
  originalName: string
}

const adSummaryShape = {
  id: z.number(),
  source: z.string(),
  externalId: z.string(),
  sourceMode: z.enum(['automatic', 'handover']),
  title: z.string(),
  company: z.string(),
  location: z.string(),
  deadline: z.string(),
  url: z.string(),
  state: z.string(),
  attempts: z.number(),
  lastError: z.string().nullable(),
  applicationId: z.number().nullable(),
  firstSeenAt: z.string(),
  reportedAt: z.string().nullable(),
}
const adSummarySchema = z.object(adSummaryShape)
const adSchema = z.object({
  ...adSummaryShape,
  evaluation: z.object({ verdict: z.string(), fitSummary: z.string(), reasons: z.array(z.string()) }).nullable(),
  body: z.string().nullable(),
})
const draftResponseSchema = z.object({ application: z.object({ id: z.number() }) })

// Only the fields the runner reads; the API sends more.
export type AdSummary = z.infer<typeof adSummarySchema>
export type Ad = z.infer<typeof adSchema>

export interface AdTransition {
  to: string
  body?: string
  // What a fetched page names; the server fills only an empty stored field.
  company?: string
  deadline?: string
  evaluation?: { verdict: string; fitSummary: string; reasons: string[] }
  error?: string
}

// POST /api/ads: the unique key is (source, externalId).
export interface AdIngest {
  source: string
  sourceMode: 'automatic' | 'handover'
  externalId: string
  url: string
  title: string
  company?: string
  location?: string
  deadline?: string
}

export interface IngestedAd {
  ad: AdSummary
  created: boolean
}

export interface DraftFile {
  name: string
  text: string
}

// The application fields and the three files of POST /api/ads/:id/draft; the
// server sets status draft itself.
export interface DraftUpload {
  company: string
  role: string
  deadline: string
  link: string
  notes: string
  files: { coverLetter: DraftFile; cv: DraftFile; ad: DraftFile }
}

export interface JobAppClient {
  listPendingSync: () => Promise<PendingAttachment[]>
  downloadAttachment: (id: number) => Promise<Uint8Array>
  // False when the attachment was replaced since it was listed; the mark stays.
  clearProfileSync: (id: number, storedName: string) => Promise<boolean>
  ingestAd: (input: AdIngest) => Promise<IngestedAd>
  listAds: (state: string) => Promise<AdSummary[]>
  getAd: (id: number) => Promise<Ad>
  transitionAd: (id: number, transition: AdTransition) => Promise<AdSummary>
  draftAd: (id: number, upload: DraftUpload) => Promise<{ applicationId: number }>
  markReported: (ids: number[]) => Promise<void>
}

interface JobAppRequest {
  method: 'GET' | 'POST' | 'PUT'
  path: string
  body?: unknown
  // Statuses returned to the caller instead of thrown.
  allow?: number[]
}

const pendingSchema = z.array(z.object({ id: z.number(), storedName: z.string(), originalName: z.string() }))
const errorSchema = z.object({ error: z.string() })

// fetch sets a FormData body's multipart Content-Type, boundary included.
function encodeBody(body: unknown, headers: Record<string, string>): string | FormData | undefined {
  if (body === undefined || body instanceof FormData) return body
  headers['Content-Type'] = 'application/json'
  return JSON.stringify(body)
}

async function fetchJobApp(config: JobAppConfig, request: JobAppRequest, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = cookie ? { Cookie: cookie } : {}
  const body = encodeBody(request.body, headers)
  try {
    return await fetch(`${config.baseUrl}${request.path}`, { method: request.method, headers, body })
  } catch (err) {
    // fetch rejects with a TypeError when the request itself fails.
    if (!(err instanceof TypeError)) throw err
    throw new CliError(1, `cannot reach job-app at ${config.baseUrl}${causeCode(err)}`, { cause: err })
  }
}

// The cause's code tells a refused connection (ECONNREFUSED) from a DNS miss
// (ENOTFOUND) or an untrusted certificate (UNABLE_TO_VERIFY_LEAF_SIGNATURE).
// Some causes carry none, such as fetch's blocked-port rejection.
function causeCode(err: TypeError): string {
  const code = (err.cause as { code?: unknown } | undefined)?.code
  return typeof code === 'string' ? ` (${code})` : ''
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
    if (!response.ok && !request.allow?.includes(response.status)) throw await failure(request, response)
    return response
  }
}

async function receive<T>(send: Sender, request: JobAppRequest, schema: z.ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await (await send(request)).json().catch(() => undefined))
  if (!parsed.success) throw new CliError(1, `job-app ${request.method} ${request.path}: bad response`)
  return parsed.data
}

function draftForm({ files, ...fields }: DraftUpload): FormData {
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) form.append(name, value)
  for (const [name, file] of Object.entries(files)) {
    form.append(name, new Blob([file.text], { type: 'text/markdown; charset=utf-8' }), file.name)
  }
  return form
}

export function createJobAppClient(config: JobAppConfig): JobAppClient {
  const send = createSender(config)
  return {
    listPendingSync: () => receive(send, { method: 'GET', path: '/api/attachments/pending-sync' }, pendingSchema),
    downloadAttachment: async (id) => {
      const response = await send({ method: 'GET', path: `/api/attachments/${id}` })
      return new Uint8Array(await response.arrayBuffer())
    },
    clearProfileSync: async (id, storedName) => {
      const path = `/api/attachments/${id}/profile-sync`
      const response = await send({ method: 'PUT', path, body: { pending: false, storedName }, allow: [409] })
      return response.ok
    },
    ingestAd: async (input) => {
      const request: JobAppRequest = { method: 'POST', path: '/api/ads', body: input }
      const response = await send(request)
      const parsed = adSummarySchema.safeParse(await response.json().catch(() => undefined))
      if (!parsed.success) throw new CliError(1, `job-app POST /api/ads: bad response`)
      return { ad: parsed.data, created: response.status === 201 }
    },
    listAds: (state) => receive(send, { method: 'GET', path: `/api/ads?state=${state}` }, z.array(adSummarySchema)),
    getAd: (id) => receive(send, { method: 'GET', path: `/api/ads/${id}` }, adSchema),
    transitionAd: (id, transition) =>
      receive(send, { method: 'POST', path: `/api/ads/${id}/transition`, body: transition }, adSummarySchema),
    draftAd: async (id, upload) => {
      const request: JobAppRequest = { method: 'POST', path: `/api/ads/${id}/draft`, body: draftForm(upload) }
      const { application } = await receive(send, request, draftResponseSchema)
      return { applicationId: application.id }
    },
    markReported: async (ids) => {
      await send({ method: 'POST', path: '/api/ads/reported', body: { ids } })
    },
  }
}
