// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { makeTempDir } from '../../test/tempDir.ts'
import type { TempDir } from '../../test/tempDir.ts'
import { createPoliteHttp } from './politeHttp.ts'
import { createRunnerState } from './state.ts'

let dir: TempDir
let clock: number
let sleeps: number[]
let requests: { url: string; init: RequestInit }[]
let answers: Map<string, () => Response>

beforeEach(() => {
  dir = makeTempDir()
  clock = 1_000_000
  sleeps = []
  requests = []
  answers = new Map()
})

afterEach(() => {
  dir.remove()
})

function fakeFetch(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  requests.push({ url: String(url), init: init ?? {} })
  clock += 10
  const answer = answers.get(String(url))
  if (!answer) return Promise.reject(new TypeError('fetch failed'))
  return Promise.resolve(answer())
}

function page(html = '<p>Ad</p>', status = 200): () => Response {
  return () => new Response(html, { status })
}

function redirect(location: string): () => Response {
  return () => new Response(null, { status: 302, headers: { location } })
}

function http(overrides: { dailyOpenCap?: number; today?: string } = {}) {
  return createPoliteHttp({
    sourceId: 'src',
    hosts: ['jobs.example', 'cdn.jobs.example'],
    dailyOpenCap: overrides.dailyOpenCap ?? 5,
    minDelayMs: 15000,
    counters: createRunnerState(dir.root).counters(overrides.today ?? '2026-11-20'),
    fetch: fakeFetch,
    now: () => clock,
    sleep: (ms) => {
      sleeps.push(ms)
      clock += ms
      return Promise.resolve()
    },
  })
}

test('a 2xx answer is the page', async () => {
  answers.set('https://jobs.example/ad/1', page('<h1>Hi</h1>'))

  expect(await http().get('https://jobs.example/ad/1')).toEqual({ kind: 'page', html: '<h1>Hi</h1>' })
})

test.each([
  ['plain http', 'http://jobs.example/ad/1'],
  ['a foreign host', 'https://evil.example/ad/1'],
  ['a lookalike host', 'https://jobs.example.evil.example/ad/1'],
])('%s is refused with no request made', async (_name, url) => {
  expect(await http().get(url)).toEqual({ kind: 'failed', category: 'bad_host' })
  expect(requests).toEqual([])
})

test('a redirect on the allowed hosts is followed', async () => {
  answers.set('https://jobs.example/ad/1', redirect('https://cdn.jobs.example/ad/1'))
  answers.set('https://cdn.jobs.example/ad/1', redirect('/ad/2'))
  answers.set('https://cdn.jobs.example/ad/2', page())

  expect((await http().get('https://jobs.example/ad/1')).kind).toBe('page')
  expect(requests.map((request) => request.init.redirect)).toEqual(['manual', 'manual', 'manual'])
})

test('a redirect onto a foreign host is refused without following it', async () => {
  answers.set('https://jobs.example/ad/1', redirect('https://tracker.example/x'))

  expect(await http().get('https://jobs.example/ad/1')).toEqual({ kind: 'failed', category: 'bad_redirect' })
  expect(requests).toHaveLength(1)
})

test('more than three redirect hops is refused', async () => {
  for (const n of [1, 2, 3, 4]) answers.set(`https://jobs.example/${n}`, redirect(`https://jobs.example/${n + 1}`))
  answers.set('https://jobs.example/5', page())

  expect(await http().get('https://jobs.example/1')).toEqual({ kind: 'failed', category: 'bad_redirect' })
  expect(requests).toHaveLength(4)
})

test('sends exactly the fixed headers and a timeout', async () => {
  answers.set('https://jobs.example/ad/1', page())

  await http().get('https://jobs.example/ad/1')

  const { init } = requests[0]
  expect(init.headers).toEqual({ 'User-Agent': 'job-agent/1.0 (personal job alert reader)', Accept: 'text/html' })
  expect(init.signal).toBeInstanceOf(AbortSignal)
})

test('waits minDelayMs between requests, redirect hops included', async () => {
  answers.set('https://jobs.example/ad/1', redirect('https://jobs.example/ad/2'))
  answers.set('https://jobs.example/ad/2', page())
  answers.set('https://jobs.example/ad/3', page())
  const client = http()

  await client.get('https://jobs.example/ad/1')
  await client.get('https://jobs.example/ad/3')

  expect(sleeps).toEqual([14990, 14990])
})

test('reaching the cap ends the day and makes no further request', async () => {
  answers.set('https://jobs.example/ad/1', page())
  const client = http({ dailyOpenCap: 1 })

  await client.get('https://jobs.example/ad/1')

  expect(client.dayEnded).toBe(true)
  expect(await client.get('https://jobs.example/ad/1')).toEqual({ kind: 'failed', category: 'daily_cap' })
  expect(requests).toHaveLength(1)
})

test('an open is counted before the request, so a failed request still counts', async () => {
  await http().get('https://jobs.example/missing')

  expect(createRunnerState(dir.root).counters('2026-11-20').opened('src')).toBe(1)
})

test('the first block ends the day, even for a new client the same day', async () => {
  answers.set('https://jobs.example/ad/1', page('', 429))

  expect(await http().get('https://jobs.example/ad/1')).toEqual({ kind: 'blocked' })

  const later = http()
  expect(later.dayEnded).toBe(true)
  expect(await later.get('https://jobs.example/ad/1')).toEqual({ kind: 'blocked' })
  expect(requests).toHaveLength(1)
})

test('counters reset on a new date', async () => {
  answers.set('https://jobs.example/ad/1', page('', 403))
  await http({ dailyOpenCap: 1 }).get('https://jobs.example/ad/1')

  expect(http({ dailyOpenCap: 1, today: '2026-11-21' }).dayEnded).toBe(false)
})

test.each([
  [401, { kind: 'blocked' }],
  [403, { kind: 'blocked' }],
  [429, { kind: 'blocked' }],
  [503, { kind: 'blocked' }],
  [404, { kind: 'gone' }],
  [410, { kind: 'gone' }],
  [500, { kind: 'failed', category: 'http_error' }],
  [302, { kind: 'failed', category: 'http_error' }],
])('status %i is %o', async (status, result) => {
  answers.set('https://jobs.example/ad/1', () => new Response(null, { status }))

  expect(await http().get('https://jobs.example/ad/1')).toEqual(result)
})

test('a network error or timeout is failed: network', async () => {
  answers.set('https://jobs.example/slow', () => {
    throw new DOMException('timed out', 'TimeoutError')
  })

  expect(await http().get('https://jobs.example/missing')).toEqual({ kind: 'failed', category: 'network' })
  expect(await http().get('https://jobs.example/slow')).toEqual({ kind: 'failed', category: 'network' })
})
