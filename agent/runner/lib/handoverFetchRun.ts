import { applyFetch, noFetches, recordBlocked } from './fetchOutcome.ts'
import type { FetchCounts } from './fetchOutcome.ts'
import type { AdSummary, JobAppClient } from './jobApp.ts'
import type { SourceConfig, SourcesConfig } from './runnerConfig.ts'
import type { PoliteHttp, SourceConnector } from './sources/types.ts'
import type { RunnerState } from './state.ts'

export interface HandoverFetchOptions {
  jobApp: JobAppClient
  connectors: SourceConnector[]
  sources: SourcesConfig
  state: RunnerState
  // The local date, YYYY-MM-DD, that a block is recorded under.
  today: string
  httpFor: (connector: SourceConnector) => PoliteHttp
}

// One entry per enabled hand-over source that fetches.
export type HandoverFetchReport = Record<string, FetchCounts>

type FetchingConnector = SourceConnector & Required<Pick<SourceConnector, 'fetchAd'>>

// The user's click always counts; the switch adds what the pre-screen liked.
function wanted(ad: AdSummary, { fetch }: SourceConfig): boolean {
  if (ad.fetchRequestedAt !== null) return true
  return fetch === 'automatic' && ad.prescreen?.verdict === 'promising'
}

// Oldest first; the API lists newest first.
async function fetchSource(options: HandoverFetchOptions, connector: FetchingConnector): Promise<FetchCounts> {
  const counts = noFetches()
  const http = options.httpFor(connector)
  const waiting = (await options.jobApp.listAds('awaiting_handover')).toReversed()
  const ads = waiting.filter((ad) => ad.source === connector.id && wanted(ad, options.sources[connector.id]))
  for (const ad of ads) {
    if (http.dayEnded) break
    const result = await connector.fetchAd({ externalId: ad.externalId, url: ad.url, title: ad.title }, http)
    const outcome = await applyFetch(options.jobApp, ad, result)
    counts[outcome] += 1
    if (outcome === 'blocked') recordBlocked(options.state, connector.id, options.today)
  }
  return counts
}

function fetchesHandovers(connector: SourceConnector): connector is FetchingConnector {
  return connector.mode === 'handover' && connector.fetchAd !== undefined
}

// Only the alert's own ad URL is fetched, through the source's PoliteHttp.
export async function runHandoverFetch(options: HandoverFetchOptions): Promise<HandoverFetchReport> {
  const report: HandoverFetchReport = {}
  for (const connector of options.connectors.filter(fetchesHandovers)) {
    if (!options.sources[connector.id].enabled) continue
    report[connector.id] = await fetchSource(options, connector)
  }
  return report
}

export function formatHandoverFetchReport(report: HandoverFetchReport): string[] {
  return Object.entries(report).map(
    ([id, { ready, duplicate, gone, retrying, failed, blocked }]) =>
      `${id} hand-over fetch: ${ready} ready, ${duplicate} duplicate, ${gone} gone, ${retrying} retrying, ${failed} failed, ${blocked} blocked`,
  )
}
