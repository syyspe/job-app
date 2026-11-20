import type { AdSummary, JobAppClient } from './jobApp.ts'
import type { Mailbox } from './mailbox.ts'
import type { SourcesConfig } from './runnerConfig.ts'
import { screenNewAds } from './screen.ts'
import type { ScreenCounts } from './screen.ts'
import type { AlertMessage, FetchResult, PoliteHttp, SourceConnector } from './sources/types.ts'
import type { RunnerState } from './state.ts'

export interface CollectRunOptions {
  mailbox: Mailbox
  jobApp: JobAppClient
  connectors: SourceConnector[]
  sources: SourcesConfig
  titleRules: string[]
  state: RunnerState
  // The local date, YYYY-MM-DD, that source failures are recorded under.
  today: string
  httpFor: (connector: SourceConnector) => PoliteHttp
}

export type FetchOutcome = 'ready' | 'duplicate' | 'gone' | 'retrying' | 'failed' | 'blocked'

export interface SourceReport {
  messages: number
  newAds: number
  existingAds: number
  emptyAlerts: number
  fetched: Record<FetchOutcome, number>
}

export interface CollectReport {
  // One entry per enabled source.
  sources: Record<string, SourceReport>
  screened: ScreenCounts
  leftNew: number
}

type FetchingConnector = SourceConnector & Required<Pick<SourceConnector, 'fetchAd'>>

interface Run {
  options: CollectRunOptions
  reports: Record<string, SourceReport>
}

function emptyReport(): SourceReport {
  const fetched = { ready: 0, duplicate: 0, gone: 0, retrying: 0, failed: 0, blocked: 0 }
  return { messages: 0, newAds: 0, existingAds: 0, emptyAlerts: 0, fetched }
}

async function ingestMessage({ options, reports }: Run, connector: SourceConnector, message: AlertMessage) {
  const report = reports[connector.id]
  report.messages += 1
  const candidates = connector.parseAlert(message)
  if (candidates.length === 0) {
    report.emptyAlerts += 1
    options.state.addFailure({ source: connector.id, date: options.today, kind: 'empty_alert' })
  }
  for (const candidate of candidates) {
    const { created } = await options.jobApp.ingestAd({ source: connector.id, sourceMode: connector.mode, ...candidate })
    if (created) report.newAds += 1
    else report.existingAds += 1
  }
}

// The watermark moves past a message only once all its candidates are in, so
// a failure part-way rereads that message next run. A message no enabled
// source claims is passed too: a source switched on later doesn't backfill.
async function collect(run: Run, enabled: SourceConnector[]): Promise<void> {
  const { mailbox, state } = run.options
  const stored = state.readWatermark()
  const after = stored.uidValidity === mailbox.uidValidity ? stored.lastUid : 0
  for await (const message of mailbox.messagesAfter(after)) {
    const connector = enabled.find((candidate) => candidate.matches(message))
    if (connector) await ingestMessage(run, connector, message)
    state.writeWatermark({ uidValidity: mailbox.uidValidity, lastUid: message.uid })
  }
}

// A failure is a same-state transition: the server counts the attempt and
// fails the ad on the third. A block moves nothing and costs no attempt.
async function applyFetch(jobApp: JobAppClient, ad: AdSummary, result: FetchResult): Promise<FetchOutcome> {
  if (result.kind === 'blocked') return 'blocked'
  if (result.kind === 'gone') {
    await jobApp.transitionAd(ad.id, { to: 'failed', error: 'gone' })
    return 'gone'
  }
  if (result.kind === 'failed') {
    const moved = await jobApp.transitionAd(ad.id, { to: 'new', error: result.category })
    return moved.state === 'failed' ? 'failed' : 'retrying'
  }
  const { text, company, deadline } = result
  const moved = await jobApp.transitionAd(ad.id, { to: 'ready', body: text, company, deadline })
  return moved.state === 'duplicate' ? 'duplicate' : 'ready'
}

function recordBlocked({ state, today }: CollectRunOptions, source: string): void {
  const recorded = state.readFailures().some((f) => f.source === source && f.date === today && f.kind === 'blocked')
  if (!recorded) state.addFailure({ source, date: today, kind: 'blocked' })
}

// Oldest first; the API lists newest first.
async function fetchSource({ options, reports }: Run, connector: FetchingConnector) {
  const http = options.httpFor(connector)
  const ads = (await options.jobApp.listAds('new')).filter((ad) => ad.source === connector.id).toReversed()
  for (const ad of ads) {
    if (http.dayEnded) return
    const result = await connector.fetchAd({ externalId: ad.externalId, url: ad.url, title: ad.title }, http)
    const outcome = await applyFetch(options.jobApp, ad, result)
    reports[connector.id].fetched[outcome] += 1
    if (outcome === 'blocked') recordBlocked(options, connector.id)
  }
}

function fetches(connector: SourceConnector): connector is FetchingConnector {
  return connector.mode === 'automatic' && connector.fetchAd !== undefined
}

// Collect, then screen titles, then fetch each automatic source's pages, the
// sources in parallel and each source's ads one at a time.
export async function runCollect(options: CollectRunOptions): Promise<CollectReport> {
  const enabled = options.connectors.filter((connector) => options.sources[connector.id].enabled)
  const run: Run = { options, reports: Object.fromEntries(enabled.map((connector) => [connector.id, emptyReport()])) }
  await collect(run, enabled)
  const screened = await screenNewAds(options.jobApp, options.titleRules)
  await Promise.all(enabled.filter(fetches).map((connector) => fetchSource(run, connector)))
  const leftNew = (await options.jobApp.listAds('new')).length
  return { sources: run.reports, screened, leftNew }
}
