import { counted } from './counted.ts'
import type { JobAppClient } from './jobApp.ts'
import type { Mailbox } from './mailbox.ts'
import type { SourcesConfig } from './runnerConfig.ts'
import { screenNewAds } from './screen.ts'
import type { ScreenCounts } from './screen.ts'
import type { AlertMessage, SourceConnector } from './sources/types.ts'
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
}

export interface SourceReport {
  messages: number
  newAds: number
  existingAds: number
  emptyAlerts: number
}

export interface CollectReport {
  // One entry per enabled source.
  sources: Record<string, SourceReport>
  screened: ScreenCounts
}

interface Run {
  options: CollectRunOptions
  reports: Record<string, SourceReport>
}

function emptyReport(): SourceReport {
  return { messages: 0, newAds: 0, existingAds: 0, emptyAlerts: 0 }
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

// Collect, then screen titles. Fetching waits for the pre-screen, in the daily run.
export async function runCollect(options: CollectRunOptions): Promise<CollectReport> {
  const enabled = options.connectors.filter((connector) => options.sources[connector.id].enabled)
  const run: Run = { options, reports: Object.fromEntries(enabled.map((connector) => [connector.id, emptyReport()])) }
  await collect(run, enabled)
  const screened = await screenNewAds(options.jobApp, options.titleRules)
  return { sources: run.reports, screened }
}

export function emailsRead({ sources }: CollectReport): number {
  return Object.values(sources).reduce((sum, report) => sum + report.messages, 0)
}

export function formatCollectReport(report: CollectReport): string {
  const titles = Object.values(report.sources).reduce((sum, source) => sum + source.newAds, 0)
  return `Read ${counted(emailsRead(report), 'new email')} with ${counted(titles, 'new job title')}.`
}
