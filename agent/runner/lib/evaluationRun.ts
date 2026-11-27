import type { HealthResult } from '../../profile/lib/ollama.ts'
import type { EvaluationOutcome } from './evaluate.ts'
import type { Ad, AdSummary, JobAppClient } from './jobApp.ts'
import { mapLimit } from './mapLimit.ts'
import type { RunnerConfig } from './runnerConfig.ts'
import { screenNewAds } from './screen.ts'
import type { ScreenCounts } from './screen.ts'
import { failedAttempt, formatFailedAttempt } from './stepFailure.ts'
import type { FailedAttempt } from './stepFailure.ts'

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

// An ad this run moved to suitable, with the evaluation's one-line fit.
export interface KeptAd {
  ad: AdSummary
  fitSummary: string
}

export interface EvaluationReport {
  screened: ScreenCounts
  skipped: string | null
  evaluated: EvaluationCounts
  kept: KeptAd[]
  queued: number
  // Every failed attempt this run, whether its ad retries or reached failed.
  failedAttempts: FailedAttempt[]
}

interface Evaluated {
  moved: AdSummary
  fitSummary: string | null
  failure: FailedAttempt | null
}

// A failure is a same-state transition carrying its category: the server adds
// the attempt and fails the ad on the third.
async function evaluateOne(options: EvaluationRunOptions, summary: AdSummary): Promise<Evaluated> {
  const outcome = await options.evaluate(await options.jobApp.getAd(summary.id))
  if (outcome.kind === 'evaluated') {
    const moved = await options.jobApp.transitionAd(summary.id, outcome.transition)
    return { moved, fitSummary: outcome.transition.evaluation.fitSummary, failure: null }
  }
  const moved = await options.jobApp.transitionAd(summary.id, { to: 'ready', error: outcome.category })
  return { moved, fitSummary: null, failure: failedAttempt(summary, outcome) }
}

function countStates(moved: AdSummary[]): EvaluationCounts {
  const count = (state: string) => moved.filter((ad) => ad.state === state).length
  return { suitable: count('suitable'), unsuitable: count('unsuitable'), retrying: count('ready'), failed: count('failed') }
}

const NONE_EVALUATED: EvaluationCounts = { suitable: 0, unsuitable: 0, retrying: 0, failed: 0 }

function keptAds(results: Evaluated[]): KeptAd[] {
  return results.flatMap(({ moved, fitSummary }) =>
    moved.state === 'suitable' && fitSummary !== null ? [{ ad: moved, fitSummary }] : [],
  )
}

// Screening needs no model, so it runs even when Ollama is down; evaluation
// is then skipped with no ad moved and no attempt counted.
export async function runEvaluation(options: EvaluationRunOptions): Promise<EvaluationReport> {
  const { jobApp, config } = options
  const screened = await screenNewAds(jobApp, config.titleRules.reject)
  const health = await options.checkHealth()
  if (!health.ok) {
    return { screened, skipped: health.reason, evaluated: NONE_EVALUATED, kept: [], queued: 0, failedAttempts: [] }
  }
  // The API lists newest first; the oldest ads are evaluated first.
  const ready = (await jobApp.listAds('ready')).toReversed()
  const batch = ready.slice(0, config.evaluation.perRunCap)
  const limits = { limit: config.evaluation.concurrency, canStart: options.canStart }
  const results = await mapLimit(batch, limits, (ad) => evaluateOne(options, ad))
  return {
    screened,
    skipped: null,
    evaluated: countStates(results.map((result) => result.moved)),
    kept: keptAds(results),
    queued: ready.length - results.length,
    failedAttempts: results.flatMap((result) => (result.failure ? [result.failure] : [])),
  }
}

export function formatEvaluationReport(report: EvaluationReport): string[] {
  const { screened, skipped, evaluated, queued, failedAttempts } = report
  const { titleRejected, awaitingHandover, leftNew } = screened
  const screenedLine = `screened: ${titleRejected} title_rejected, ${awaitingHandover} awaiting_handover, ${leftNew} left new`
  if (skipped) return [screenedLine, `evaluation skipped: ${skipped}`]
  const { suitable, unsuitable, retrying, failed } = evaluated
  return [
    screenedLine,
    `evaluated: ${suitable} suitable, ${unsuitable} unsuitable, ${retrying} retrying, ${failed} failed`,
    `queued: ${queued} ready ads over the per-run cap`,
    ...failedAttempts.map((attempt) => formatFailedAttempt('evaluation', attempt)),
  ]
}
