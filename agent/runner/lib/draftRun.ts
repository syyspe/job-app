import type { HealthResult } from '../../profile/lib/ollama.ts'
import { buildDraft } from './draftApplication.ts'
import type { DraftOutcome } from './draft.ts'
import type { Ad, AdSummary, JobAppClient } from './jobApp.ts'
import { mapLimit } from './mapLimit.ts'
import type { DraftConfig } from './runnerConfig.ts'
import { failedAttempt, formatFailedAttempt } from './stepFailure.ts'
import type { FailedAttempt } from './stepFailure.ts'

export interface DraftRunOptions {
  jobApp: JobAppClient
  config: DraftConfig
  checkHealth: () => Promise<HealthResult>
  write: (ad: Ad) => Promise<DraftOutcome>
  // The run's date, YYYY-MM-DD, for the saved ad's header.
  today: string
  // Asked before each ad; an ad that doesn't start stays suitable, untouched.
  canStart?: () => boolean
}

export interface DraftCounts {
  drafted: number
  // Attempts recorded on ads that stay suitable, and ads that reached failed.
  retrying: number
  failed: number
}

export interface DraftReport {
  skipped: string | null
  counts: DraftCounts
  queued: number
  // Every failed attempt this run, whether its ad retries or reached failed.
  failedAttempts: FailedAttempt[]
}

type DraftResult = keyof DraftCounts

interface Drafted {
  result: DraftResult
  failure: FailedAttempt | null
}

// A failure is a same-state transition carrying its category: the server adds
// the attempt and fails the ad on the third.
async function draftOne(options: DraftRunOptions, summary: AdSummary): Promise<Drafted> {
  const { jobApp, config, today } = options
  const ad = await jobApp.getAd(summary.id)
  const outcome = await options.write(ad)
  if (outcome.kind === 'failed') {
    const moved = await jobApp.transitionAd(ad.id, { to: 'suitable', error: outcome.category })
    return { result: moved.state === 'failed' ? 'failed' : 'retrying', failure: failedAttempt(summary, outcome) }
  }
  await jobApp.draftAd(ad.id, buildDraft(ad, outcome.output, { filePrefix: config.filePrefix, savedOn: today }))
  return { result: 'drafted', failure: null }
}

function countResults(results: DraftResult[]): DraftCounts {
  const count = (result: DraftResult) => results.filter((candidate) => candidate === result).length
  return { drafted: count('drafted'), retrying: count('retrying'), failed: count('failed') }
}

// With Ollama down no ad is touched and no attempt counted.
export async function runDrafting(options: DraftRunOptions): Promise<DraftReport> {
  const { jobApp, config } = options
  const health = await options.checkHealth()
  if (!health.ok) return { skipped: health.reason, counts: countResults([]), queued: 0, failedAttempts: [] }
  // The API lists newest first; the oldest ads are drafted first.
  const suitable = (await jobApp.listAds('suitable')).toReversed()
  const batch = suitable.slice(0, config.perRunCap)
  const limits = { limit: config.concurrency, canStart: options.canStart }
  const drafted = await mapLimit(batch, limits, (ad) => draftOne(options, ad))
  return {
    skipped: null,
    counts: countResults(drafted.map((one) => one.result)),
    queued: suitable.length - drafted.length,
    failedAttempts: drafted.flatMap((one) => (one.failure ? [one.failure] : [])),
  }
}

export function formatDraftReport({ skipped, counts, queued, failedAttempts }: DraftReport): string[] {
  if (skipped) return [`drafting skipped: ${skipped}`]
  const { drafted, retrying, failed } = counts
  return [
    `drafted: ${drafted} drafted, ${retrying} retrying, ${failed} failed`,
    `queued: ${queued} suitable ads over the per-run cap`,
    ...failedAttempts.map((attempt) => formatFailedAttempt('drafting', attempt)),
  ]
}
