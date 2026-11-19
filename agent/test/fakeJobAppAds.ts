import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJson, sendJson } from './fakeHttp.ts'
import type { FakeJobApp } from './fakeJobApp.ts'

export interface FakeAd {
  id: number
  sourceMode: 'automatic' | 'handover'
  title: string
  company: string
  location: string
  deadline: string
  url: string
  state: string
  attempts: number
  lastError: string | null
  evaluation: unknown
  body: string | null
  firstSeenAt: string
}

export interface FakeTransition {
  id: number
  to: string
  evaluation?: unknown
  error?: string
}

export function fakeAd(fields: Partial<FakeAd> & { id: number }): FakeAd {
  return {
    sourceMode: 'automatic',
    title: `Developer ${fields.id}`,
    company: 'Example Oy',
    location: 'Helsinki',
    deadline: '',
    url: `https://jobs.example/${fields.id}`,
    state: 'new',
    attempts: 0,
    lastError: null,
    evaluation: null,
    body: null,
    firstSeenAt: `2026-11-${String(fields.id).padStart(2, '0')} 08:00:00`,
    ...fields,
  }
}

function summary({ body: _body, ...rest }: FakeAd) {
  return rest
}

// Same-state with an error records an attempt, and the third one fails the
// ad, as the server does. Anything else just moves the ad.
function applyTransition(ad: FakeAd, transition: FakeTransition): void {
  if (transition.to === ad.state && transition.error) {
    ad.attempts += 1
    ad.lastError = transition.error
    if (ad.attempts >= 3) ad.state = 'failed'
    return
  }
  ad.state = transition.to
  ad.evaluation = transition.evaluation ?? ad.evaluation
}

interface TransitionTarget {
  fake: FakeJobApp
  ad: FakeAd
}

async function answerTransition({ fake, ad }: TransitionTarget, req: IncomingMessage, res: ServerResponse) {
  const transition = { id: ad.id, ...(await readJson(req)) } as FakeTransition
  fake.transitions.push(transition)
  applyTransition(ad, transition)
  sendJson(res, 200, summary(ad))
}

// Lists newest first, like the real API.
export function answerAds(fake: FakeJobApp, req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '', 'http://fake')
  if (url.pathname === '/api/ads') {
    if (fake.failure === 'malformed') return sendJson(res, 200, { ads: 'nope' })
    const listed = fake.ads.filter((ad) => ad.state === url.searchParams.get('state'))
    return sendJson(res, 200, listed.toSorted((a, b) => b.firstSeenAt.localeCompare(a.firstSeenAt)).map(summary))
  }
  const [, id, action] = /^\/api\/ads\/(\d+)(\/transition)?$/.exec(url.pathname) ?? []
  const ad = fake.ads.find((candidate) => candidate.id === Number(id))
  if (!ad) return sendJson(res, 404, { error: 'ad not found' })
  if (action) return void answerTransition({ fake, ad }, req, res)
  sendJson(res, 200, ad)
}
