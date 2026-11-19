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

export interface JobAppClient {
  listPendingSync: () => Promise<PendingAttachment[]>
  downloadAttachment: (id: number) => Promise<Uint8Array>
  setProfileSync: (id: number, pending: boolean) => Promise<void>
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

// Logs in on first use and once more when the session has expired.
function createSender(config: JobAppConfig): (request: JobAppRequest) => Promise<Response> {
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

export function createJobAppClient(config: JobAppConfig): JobAppClient {
  const send = createSender(config)
  return {
    listPendingSync: async () => {
      const request: JobAppRequest = { method: 'GET', path: '/api/attachments/pending-sync' }
      const parsed = pendingSchema.safeParse(await (await send(request)).json().catch(() => undefined))
      if (!parsed.success) throw new CliError(1, `job-app GET ${request.path}: bad response`)
      return parsed.data
    },
    downloadAttachment: async (id) => {
      const response = await send({ method: 'GET', path: `/api/attachments/${id}` })
      return new Uint8Array(await response.arrayBuffer())
    },
    setProfileSync: async (id, pending) => {
      await send({ method: 'PUT', path: `/api/attachments/${id}/profile-sync`, body: { pending } })
    },
  }
}
