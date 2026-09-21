export interface ApiConfig {
  baseUrl: string
  username: string
  password: string
}

export interface ApiFile {
  bytes: Uint8Array
  mimeType: string
}

export interface ApiClient {
  getJson<T>(path: string): Promise<T>
  sendJson<T>(method: 'POST' | 'PUT', path: string, body: unknown): Promise<T>
  sendForm<T>(path: string, form: FormData): Promise<T>
  getFile(path: string): Promise<ApiFile>
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

interface RequestSpec {
  method?: string
  headers?: Record<string, string>
  body?: string | FormData
}

async function readError(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null)
  if (body && typeof body === 'object' && 'error' in body) {
    return String((body as { error: unknown }).error)
  }
  return response.statusText
}

export function createApiClient(config: ApiConfig): ApiClient {
  let cookie: string | null = null

  async function fetchOrExplain(path: string, spec: RequestSpec): Promise<Response> {
    try {
      return await fetch(`${config.baseUrl}${path}`, spec)
    } catch {
      throw new Error(
        `cannot reach the job-applications API at ${config.baseUrl} — ` +
          'is it running? (npm run dev:server)',
      )
    }
  }

  async function login(): Promise<string> {
    const response = await fetchOrExplain('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: config.username, password: config.password }),
    })
    if (response.status === 401) {
      throw new Error(
        `login failed for user ${config.username} — check JOBAPP_USERNAME/JOBAPP_PASSWORD`,
      )
    }
    const setCookie = response.headers.get('set-cookie')
    if (!setCookie) throw new Error('login did not set a session cookie')
    return setCookie.split(';')[0]
  }

  async function sessionCookie(): Promise<string> {
    if (cookie === null) cookie = await login()
    return cookie
  }

  async function sendWithSession(path: string, spec: RequestSpec): Promise<Response> {
    const session = await sessionCookie()
    return fetchOrExplain(path, { ...spec, headers: { ...spec.headers, Cookie: session } })
  }

  async function checked(response: Response): Promise<Response> {
    if (response.ok) return response
    throw new ApiError(response.status, await readError(response))
  }

  async function send(path: string, spec: RequestSpec): Promise<Response> {
    const response = await sendWithSession(path, spec)
    if (response.status !== 401) return checked(response)

    cookie = null
    return checked(await sendWithSession(path, spec))
  }

  return {
    async getJson<T>(path: string): Promise<T> {
      const response = await send(path, {})
      return (await response.json()) as T
    },

    async sendJson<T>(method: 'POST' | 'PUT', path: string, body: unknown): Promise<T> {
      const response = await send(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      return (await response.json()) as T
    },

    async sendForm<T>(path: string, form: FormData): Promise<T> {
      const response = await send(path, { method: 'POST', body: form })
      return (await response.json()) as T
    },

    async getFile(path: string): Promise<ApiFile> {
      const response = await send(path, {})
      const contentType = response.headers.get('content-type') ?? 'application/octet-stream'
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        mimeType: contentType.split(';')[0].trim(),
      }
    },
  }
}
