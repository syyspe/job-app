import type { HealthResult } from '../../profile/lib/ollama.ts'
import type { EvaluationOutcome } from './evaluate.ts'
import type { Ad, AdSummary, JobAppClient } from './jobApp.ts'
import { mapLimit } from './mapLimit.ts'
import type { RunnerConfig } from './runnerConfig.ts'
import { screenNewAds } from './screen.ts'
import type { ScreenCounts } from './screen.ts'

export interface EvaluationRunOptions {
  jobApp: JobAppClient
  config: Pick<RunnerConfig, 'titleRules' | 'evaluation'>
  checkHealth: () => Promise<HealthResult>
  evaluate: (ad: Ad) => Promise<EvaluationOutcome>
  // Asked before each ad; an ad that doesn't start stays ready, untouched.
  canStart?: () => boolean
}

export interface EvaluationCounts {
  suitable: number
  unsuitable: number
  // Attempts recorded on ads that stay ready, and ads that reached failed.
  retrying: number
  failed: number
}

export interface EvaluationReport {
  screened: ScreenCounts
  skipped: string | null
  evaluated: EvaluationCounts
  queued: number
}

// A failure is a same-state transition carrying its category: the server adds
// the attempt and fails the ad on the third.
async function evaluateOne(options: EvaluationRunOptions, summary: AdSummary): Promise<AdSummary> {
  const outcome = await options.evaluate(await options.jobApp.getAd(summary.id))
  if (outcome.kind === 'evaluated') return options.jobApp.transitionAd(summary.id, outcome.transition)
  return options.jobApp.transitionAd(summary.id, { to: 'ready', error: outcome.category })
}

function countStates(moved: AdSummary[]): EvaluationCounts {
  const count = (state: string) => moved.filter((ad) => ad.state === state).length
  return { suitable: count('suitable'), unsuitable: count('unsuitable'), retrying: count('ready'), failed: count('failed') }
}

const NONE_EVALUATED: EvaluationCounts = { suitable: 0, unsuitable: 0, retrying: 0, failed: 0 }

// Screening needs no model, so it runs even when Ollama is down; evaluation
// is then skipped with no ad moved and no attempt counted.
export async function runEvaluation(options: EvaluationRunOptions): Promise<EvaluationReport> {
  const { jobApp, config } = options
  const screened = await screenNewAds(jobApp, config.titleRules.reject)
  const health = await options.checkHealth()
  if (!health.ok) return { screened, skipped: health.reason, evaluated: NONE_EVALUATED, queued: 0 }
  // The API lists newest first; the oldest ads are evaluated first.
  const ready = (await jobApp.listAds('ready')).toReversed()
  const batch = ready.slice(0, config.evaluation.perRunCap)
  const limits = { limit: config.evaluation.concurrency, canStart: options.canStart }
  const moved = await mapLimit(batch, limits, (ad) => evaluateOne(options, ad))
  return { screened, skipped: null, evaluated: countStates(moved), queued: ready.length - moved.length }
}

export function formatEvaluationReport({ screened, skipped, evaluated, queued }: EvaluationReport): string[] {
  const { titleRejected, awaitingHandover, leftNew } = screened
  const screenedLine = `screened: ${titleRejected} title_rejected, ${awaitingHandover} awaiting_handover, ${leftNew} left new`
  if (skipped) return [screenedLine, `evaluation skipped: ${skipped}`]
  const { suitable, unsuitable, retrying, failed } = evaluated
  return [
    screenedLine,
    `evaluated: ${suitable} suitable, ${unsuitable} unsuitable, ${retrying} retrying, ${failed} failed`,
    `queued: ${queued} ready ads over the per-run cap`,
  ]
}
