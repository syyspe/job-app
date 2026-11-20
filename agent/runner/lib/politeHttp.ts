import type { PageResult, PoliteHttp } from './sources/types.ts'
import type { DailyCounters } from './state.ts'

export interface PoliteHttpOptions {
  sourceId: string
  hosts: string[]
  dailyOpenCap: number
  minDelayMs: number
  counters: DailyCounters
  fetch: typeof fetch
  now: () => number
  sleep: (ms: number) => Promise<void>
}

// No cookies, credentials or contact address: the site sees only this.
const HEADERS = { 'User-Agent': 'job-agent/1.0 (personal job alert reader)', Accept: 'text/html' }
const TIMEOUT_MS = 30000
const MAX_REDIRECTS = 3
const BLOCKED_STATUSES = [401, 403, 429, 503]
const GONE_STATUSES = [404, 410]

type Hop = { kind: 'redirect'; location: string } | PageResult

function allowed(url: URL | null, hosts: string[]): url is URL {
  return url !== null && url.protocol === 'https:' && hosts.includes(url.hostname)
}

async function classify(response: Response): Promise<Hop> {
  const location = response.headers.get('location')
  if (response.status >= 300 && response.status < 400 && location) return { kind: 'redirect', location }
  if (response.ok) return { kind: 'page', html: await response.text() }
  if (BLOCKED_STATUSES.includes(response.status)) return { kind: 'blocked' }
  if (GONE_STATUSES.includes(response.status)) return { kind: 'gone' }
  return { kind: 'failed', category: 'http_error' }
}

// fetch rejects with a TypeError when the request fails, and with a
// TimeoutError once the signal's time runs out.
function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof DOMException && err.name === 'TimeoutError')
}

// Every request, redirect hops included, waits until minDelayMs has passed
// since this source's previous one; redirects stay on the allowed hosts.
function createFollower(options: PoliteHttpOptions): (start: URL) => Promise<PageResult> {
  let lastRequestAt: number | undefined

  async function request(url: URL): Promise<Hop> {
    if (lastRequestAt !== undefined) {
      const wait = lastRequestAt + options.minDelayMs - options.now()
      if (wait > 0) await options.sleep(wait)
    }
    lastRequestAt = options.now()
    try {
      const signal = AbortSignal.timeout(TIMEOUT_MS)
      return await classify(await options.fetch(url, { headers: HEADERS, redirect: 'manual', signal }))
    } catch (err) {
      if (!isNetworkError(err)) throw err
      return { kind: 'failed', category: 'network' }
    }
  }

  return async (start) => {
    let url = start
    for (let hops = 0; ; hops += 1) {
      const hop = await request(url)
      if (hop.kind !== 'redirect') return hop
      const next = URL.parse(hop.location, url.href)
      if (hops === MAX_REDIRECTS || !allowed(next, options.hosts)) return { kind: 'failed', category: 'bad_redirect' }
      url = next
    }
  }
}

export function createPoliteHttp(options: PoliteHttpOptions): PoliteHttp {
  const { sourceId, hosts, counters } = options
  const follow = createFollower(options)
  const http: PoliteHttp = {
    get dayEnded() {
      return counters.isBlocked(sourceId) || counters.opened(sourceId) >= options.dailyOpenCap
    },
    async get(target) {
      const url = URL.parse(target)
      if (!allowed(url, hosts)) return { kind: 'failed', category: 'bad_host' }
      if (counters.isBlocked(sourceId)) return { kind: 'blocked' }
      if (http.dayEnded) return { kind: 'failed', category: 'daily_cap' }
      // Counted before the request, so a crash never undercounts.
      counters.countOpen(sourceId)
      const result = await follow(url)
      if (result.kind === 'blocked') counters.markBlocked(sourceId)
      return result
    },
  }
  return http
}
