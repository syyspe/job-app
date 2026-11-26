import type { AdSummary, JobAppClient } from './jobApp.ts'
import { mapLimit } from './mapLimit.ts'
import type { PrescreenOutcome } from './prescreen.ts'
import type { RunnerConfig } from './runnerConfig.ts'
import { failedAttempt, formatFailedAttempt } from './stepFailure.ts'
import type { FailedAttempt } from './stepFailure.ts'

export interface PrescreenRunOptions {
  jobApp: JobAppClient
  config: RunnerConfig['prescreen']
  prescreen: (ad: AdSummary) => Promise<PrescreenOutcome>
  // Asked before each ad; an ad that doesn't start stays unscreened.
  canStart?: () => boolean
}

export interface PrescreenReport {
  screened: { promising: number; notPromising: number }
  failed: number
  queued: number
  // The ads pre-screened in this run, as they were then, for the summary: a
  // later step may blank them.
  ads: AdSummary[]
  failedAttempts: FailedAttempt[]
}

interface Prescreened {
  screened: AdSummary | null
  failure: FailedAttempt | null
}

// A failure stores nothing and counts no attempt: the ad is tried again next
// run, until it expires.
async function prescreenOne(options: PrescreenRunOptions, ad: AdSummary): Promise<Prescreened> {
  const outcome = await options.prescreen(ad)
  if (outcome.kind === 'failed') return { screened: null, failure: failedAttempt(ad, outcome) }
  return { screened: await options.jobApp.setPrescreen(ad.id, outcome.prescreen), failure: null }
}

// Hand-over ads only: an automatic ad is fetched during collect, before any
// model step could screen it.
export async function runPrescreen(options: PrescreenRunOptions): Promise<PrescreenReport> {
  const { jobApp, config } = options
  const waiting = (await jobApp.listAds('awaiting_handover')).toReversed()
  const unscreened = waiting.filter((ad) => ad.sourceMode === 'handover' && ad.prescreen === null)
  const batch = unscreened.slice(0, config.perRunCap)
  const limits = { limit: config.concurrency, canStart: options.canStart }
  const results = await mapLimit(batch, limits, (ad) => prescreenOne(options, ad))
  const screened = results.flatMap((result) => (result.screened ? [result.screened] : []))
  const count = (verdict: string) => screened.filter((ad) => ad.prescreen?.verdict === verdict).length
  return {
    screened: { promising: count('promising'), notPromising: count('not_promising') },
    failed: results.length - screened.length,
    queued: unscreened.length - results.length,
    ads: screened,
    failedAttempts: results.flatMap((result) => (result.failure ? [result.failure] : [])),
  }
}

export function formatPrescreenReport({ screened, failed, queued, failedAttempts }: PrescreenReport): string[] {
  return [
    `pre-screened: ${screened.promising} promising, ${screened.notPromising} not promising, ${failed} failed`,
    `queued: ${queued} ads over the pre-screen cap`,
    ...failedAttempts.map((attempt) => formatFailedAttempt('pre-screen', attempt)),
  ]
}
