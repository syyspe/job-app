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
  externalId: string
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
  applicationId: number | null
  prescreen: { verdict: 'promising' | 'not_promising'; reason: string } | null
  fetchRequestedAt: string | null
  firstSeenAt: string
  reportedAt: string | null
}

export interface FakeTransition {
  id: number
  to: string
  body?: string
  company?: string
  deadline?: string
  evaluation?: FakeEvaluation
  error?: string
}

export interface FakeDraft {
  id: number
  fields: Record<string, string>
  files: Record<string, { name: string; type: string; text: string }>
}

export function fakeAd(fields: Partial<FakeAd> & { id: number }): FakeAd {
  return {
    source: 'testsource',
    externalId: `ext-${fields.id}`,
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
    applicationId: null,
    prescreen: null,
    fetchRequestedAt: null,
    reportedAt: null,
    firstSeenAt: `2026-11-${String(fields.id).padStart(2, '0')} 08:00:00`,
    ...fields,
  }
}

function summary({ body: _body, ...rest }: FakeAd) {
  return rest
}

function recordAttempt(ad: FakeAd, error: string): void {
  ad.attempts += 1
  ad.lastError = error
  if (ad.attempts >= 3) ad.state = 'failed'
}

// Same-state with an error records an attempt, and the third one fails the
// ad, as the server does. Anything else just moves the ad, filling company
// and deadline only while they are empty.
function applyTransition(ad: FakeAd, transition: FakeTransition): void {
  if (transition.to === ad.state && transition.error) return recordAttempt(ad, transition.error)
  moveAd(ad, transition)
}

// A move clears reportedAt, as on the server.
function moveAd(ad: FakeAd, { to, error, evaluation, body, company, deadline }: FakeTransition): void {
  ad.state = to
  ad.reportedAt = null
  if (to === 'failed') ad.lastError = error ?? null
  ad.evaluation = evaluation ?? ad.evaluation
  ad.body = body ?? ad.body
  ad.company ||= company ?? ''
  ad.deadline ||= deadline ?? ''
}

interface TransitionTarget {
  fake: FakeJobApp
  ad: FakeAd
}

async function answerTransition({ fake, ad }: TransitionTarget, req: IncomingMessage, res: ServerResponse) {
  const transition = { id: ad.id, ...(await readJson(req)) } as FakeTransition
  fake.transitions.push(transition)
  if (fake.transitionFailsFor === ad.id) return sendJson(res, 500, { error: 'internal server error' })
  applyTransition(ad, transition)
  sendJson(res, 200, summary(ad))
}

// Only a new or awaiting_handover ad takes a pre-screen, as on the server.
async function answerPrescreen({ fake, ad }: TransitionTarget, req: IncomingMessage, res: ServerResponse) {
  const prescreen = (await readJson(req)) as FakeAd['prescreen']
  fake.prescreens.push({ id: ad.id, prescreen })
  if (ad.state !== 'new' && ad.state !== 'awaiting_handover') return sendJson(res, 409, { error: `an ad cannot be pre-screened from ${ad.state}` })
  ad.prescreen = prescreen
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
    else draft.files[name] = { name: value.name, type: value.type, text: await value.text() }
  }
  return draft
}

// Only a suitable ad can be drafted, as on the server.
async function answerDraft({ fake, ad }: TransitionTarget, req: IncomingMessage, res: ServerResponse) {
  const draft = await toDraft(ad.id, await readForm(req))
  if (ad.state !== 'suitable') return sendJson(res, 409, { error: `an ad cannot be drafted from ${ad.state}` })
  fake.drafts.push(draft)
  ad.state = 'drafted'
  ad.applicationId = 100 + fake.drafts.length
  sendJson(res, 201, { ad, application: { id: ad.applicationId } })
}

// Idempotent on (source, externalId), as on the server: 201 new, 200 known.
// Ads are stamped in ingest order, so the list stays newest first.
async function answerIngest(fake: FakeJobApp, req: IncomingMessage, res: ServerResponse) {
  const input = (await readJson(req)) as Partial<FakeAd> & { source: string; externalId: string }
  if (fake.ingestFailsFor === input.externalId) return sendJson(res, 500, { error: 'internal server error' })
  const known = fake.ads.find((ad) => ad.source === input.source && ad.externalId === input.externalId)
  if (known) return sendJson(res, 200, summary(known))
  const id = fake.ads.length + 1
  const ad = fakeAd({ ...input, id, company: input.company ?? '', location: input.location ?? '', deadline: input.deadline ?? '' })
  ad.firstSeenAt = `2026-12-01 08:00:${String(id).padStart(2, '0')}`
  fake.ads.push(ad)
  sendJson(res, 201, summary(ad))
}

async function answerReported(fake: FakeJobApp, req: IncomingMessage, res: ServerResponse) {
  const { ids } = (await readJson(req)) as { ids: number[] }
  if (fake.failure === 'reported') return sendJson(res, 500, { error: 'internal server error' })
  for (const ad of fake.ads) if (ids.includes(ad.id)) ad.reportedAt = '2026-12-01 20:00:00'
  res.writeHead(204).end()
}

// Lists newest first, like the real API.
function answerAdCollection(fake: FakeJobApp, req: IncomingMessage, res: ServerResponse): void {
  if (req.method === 'POST') return void answerIngest(fake, req, res)
  if (fake.failure === 'malformed') return sendJson(res, 200, { ads: 'nope' })
  const state = new URL(req.url ?? '', 'http://fake').searchParams.get('state')
  const listed = fake.ads.filter((ad) => state === null || ad.state === state)
  sendJson(res, 200, listed.toSorted((a, b) => b.firstSeenAt.localeCompare(a.firstSeenAt)).map(summary))
}

export function answerAds(fake: FakeJobApp, req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '', 'http://fake')
  if (url.pathname === '/api/ads/reported') return void answerReported(fake, req, res)
  if (url.pathname === '/api/ads') return answerAdCollection(fake, req, res)
  const [, id, action] = /^\/api\/ads\/(\d+)(\/transition|\/draft|\/prescreen)?$/.exec(url.pathname) ?? []
  const ad = fake.ads.find((candidate) => candidate.id === Number(id))
  if (!ad) return sendJson(res, 404, { error: 'ad not found' })
  if (action === '/transition') return void answerTransition({ fake, ad }, req, res)
  if (action === '/draft') return void answerDraft({ fake, ad }, req, res)
  if (action === '/prescreen') return void answerPrescreen({ fake, ad }, req, res)
  sendJson(res, 200, ad)
}
