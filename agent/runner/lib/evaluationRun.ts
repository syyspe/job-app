import type { HealthResult } from '../../profile/lib/ollama.ts'
import type { EvaluationOutcome } from './evaluate.ts'
import type { Ad, AdSummary, JobAppClient } from './jobApp.ts'
import type { RunnerConfig } from './runnerConfig.ts'
import { screenTarget } from './titleRules.ts'

export interface EvaluationRunOptions {
  jobApp: JobAppClient
  config: RunnerConfig
  checkHealth: () => Promise<HealthResult>
  evaluate: (ad: Ad) => Promise<EvaluationOutcome>
}

export interface ScreenCounts {
  titleRejected: number
  awaitingHandover: number
  leftNew: number
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

async function screenNewAds(jobApp: JobAppClient, phrases: string[]): Promise<ScreenCounts> {
  const counts: ScreenCounts = { titleRejected: 0, awaitingHandover: 0, leftNew: 0 }
  for (const ad of await jobApp.listAds('new')) {
    const target = screenTarget(ad, phrases)
    if (target === null) {
      counts.leftNew += 1
      continue
    }
    await jobApp.transitionAd(ad.id, { to: target })
    if (target === 'title_rejected') counts.titleRejected += 1
    else counts.awaitingHandover += 1
  }
  return counts
}

// Runs fn over items with at most `limit` calls in flight, keeping input order.
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
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
  const moved = await mapLimit(batch, config.evaluation.concurrency, (ad) => evaluateOne(options, ad))
  return { screened, skipped: null, evaluated: countStates(moved), queued: ready.length - batch.length }
}
