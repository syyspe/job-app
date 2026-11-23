import { applyFetch, noFetches, recordBlocked } from './fetchOutcome.ts'
import type { FetchCounts } from './fetchOutcome.ts'
import type { JobAppClient } from './jobApp.ts'
import type { Mailbox } from './mailbox.ts'
import type { SourcesConfig } from './runnerConfig.ts'
import { screenNewAds } from './screen.ts'
import type { ScreenCounts } from './screen.ts'
import type { AlertMessage, PoliteHttp, SourceConnector } from './sources/types.ts'
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

export interface SourceReport {
  messages: number
  newAds: number
  existingAds: number
  emptyAlerts: number
  fetched: FetchCounts
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
  return { messages: 0, newAds: 0, existingAds: 0, emptyAlerts: 0, fetched: noFetches() }
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

// Oldest first; the API lists newest first.
async function fetchSource({ options, reports }: Run, connector: FetchingConnector) {
  const http = options.httpFor(connector)
  const ads = (await options.jobApp.listAds('new')).filter((ad) => ad.source === connector.id).toReversed()
  for (const ad of ads) {
    if (http.dayEnded) return
    const result = await connector.fetchAd({ externalId: ad.externalId, url: ad.url, title: ad.title }, http)
    const outcome = await applyFetch(options.jobApp, ad, result)
    reports[connector.id].fetched[outcome] += 1
    if (outcome === 'blocked') recordBlocked(options.state, connector.id, options.today)
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

function sourceLine(id: string, report: SourceReport, connectors: SourceConnector[]): string {
  const { messages, newAds, existingAds, emptyAlerts, fetched } = report
  const collected = `${id}: ${messages} messages, ${newAds} new ads, ${existingAds} existing, ${emptyAlerts} empty alerts`
  if (connectors.find((connector) => connector.id === id)?.mode === 'handover') return collected
  const { ready, duplicate, gone, retrying, failed, blocked } = fetched
  return `${collected}; fetched ${ready} ready, ${duplicate} duplicate, ${gone} gone, ${retrying} retrying, ${failed} failed, ${blocked} blocked`
}

export function formatCollectReport({ sources, screened, leftNew }: CollectReport, connectors: SourceConnector[]): string[] {
  const { titleRejected, awaitingHandover } = screened
  return [
    ...Object.entries(sources).map(([id, report]) => sourceLine(id, report, connectors)),
    `screened: ${titleRejected} title_rejected, ${awaitingHandover} awaiting_handover`,
    `left new: ${leftNew} ads`,
  ]
}
