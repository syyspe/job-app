import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJson, sendJson } from './fakeHttp.ts'
import type { FakeJobApp } from './fakeJobApp.ts'

export interface FakeEvaluation {
  verdict: string
  fitSummary: string
  reasons: string[]
}

export interface FakeAd {
  id: number
  source: string
  sourceMode: 'automatic' | 'handover'
  title: string
  company: string
  location: string
  deadline: string
  url: string
  state: string
  attempts: number
  lastError: string | null
  evaluation: FakeEvaluation | null
  body: string | null
  firstSeenAt: string
}

export interface FakeTransition {
  id: number
  to: string
  evaluation?: FakeEvaluation
  error?: string
}

export interface FakeDraft {
  id: number
  fields: Record<string, string>
  files: Record<string, { name: string; text: string }>
}

export function fakeAd(fields: Partial<FakeAd> & { id: number }): FakeAd {
  return {
    source: 'testsource',
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

async function readForm(req: IncomingMessage): Promise<FormData> {
  const parts: Buffer[] = []
  for await (const part of req) parts.push(part as Buffer)
  const headers = { 'content-type': req.headers['content-type'] ?? '' }
  return new Response(Buffer.concat(parts), { headers }).formData()
}

// Multipart sends text-field line breaks as CRLF; the server turns them back to LF.
async function toDraft(id: number, form: FormData): Promise<FakeDraft> {
  const draft: FakeDraft = { id, fields: {}, files: {} }
  for (const [name, value] of form) {
    if (typeof value === 'string') draft.fields[name] = value.replaceAll('\r\n', '\n')
    else draft.files[name] = { name: value.name, text: await value.text() }
  }
  return draft
}

// Only a suitable ad can be drafted, as on the server.
async function answerDraft({ fake, ad }: TransitionTarget, req: IncomingMessage, res: ServerResponse) {
  const draft = await toDraft(ad.id, await readForm(req))
  if (ad.state !== 'suitable') return sendJson(res, 409, { error: `an ad cannot be drafted from ${ad.state}` })
  fake.drafts.push(draft)
  ad.state = 'drafted'
  sendJson(res, 201, { ad, application: { id: 100 + fake.drafts.length } })
}

// Lists newest first, like the real API.
export function answerAds(fake: FakeJobApp, req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '', 'http://fake')
  if (url.pathname === '/api/ads') {
    if (fake.failure === 'malformed') return sendJson(res, 200, { ads: 'nope' })
    const listed = fake.ads.filter((ad) => ad.state === url.searchParams.get('state'))
    return sendJson(res, 200, listed.toSorted((a, b) => b.firstSeenAt.localeCompare(a.firstSeenAt)).map(summary))
  }
  const [, id, action] = /^\/api\/ads\/(\d+)(\/transition|\/draft)?$/.exec(url.pathname) ?? []
  const ad = fake.ads.find((candidate) => candidate.id === Number(id))
  if (!ad) return sendJson(res, 404, { error: 'ad not found' })
  if (action === '/transition') return void answerTransition({ fake, ad }, req, res)
  if (action === '/draft') return void answerDraft({ fake, ad }, req, res)
  sendJson(res, 200, ad)
}
