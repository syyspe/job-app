import type { AdSummary, JobAppClient } from './jobApp.ts'
import { mapLimit } from './mapLimit.ts'
import type { PrescreenOutcome } from './prescreen.ts'
import type { RunnerConfig } from './runnerConfig.ts'
import { failedAttempt } from './stepFailure.ts'
import type { FailedAttempt } from './stepFailure.ts'

export interface PrescreenRunOptions {
  jobApp: JobAppClient
  config: RunnerConfig['prescreen']
  prescreen: (ad: AdSummary) => Promise<PrescreenOutcome>
  // Asked before each ad; an ad that doesn't start stays unscreened.
  canStart?: () => boolean
}

export interface PrescreenReport {
  promising: AdSummary[]
  // Dismissed at once; each as setPrescreen returned it, verdict and reason set.
  setAside: AdSummary[]
  failed: number
  queued: number
  failedAttempts: FailedAttempt[]
}

interface Prescreened {
  screened: AdSummary | null
  failure: FailedAttempt | null
}

// A failure stores nothing and counts no attempt: the ad is tried again next
// run. If the dismissal fails after the verdict is stored, the error ends the
// step; the ad keeps its verdict where it was, is neither screened nor
// fetched again, and a hand-over ad is dismissed later by expiry.
async function prescreenOne(options: PrescreenRunOptions, ad: AdSummary): Promise<Prescreened> {
  const outcome = await options.prescreen(ad)
  if (outcome.kind === 'failed') return { screened: null, failure: failedAttempt(ad, outcome) }
  const screened = await options.jobApp.setPrescreen(ad.id, outcome.prescreen)
  if (outcome.prescreen.verdict === 'not_promising') await options.jobApp.transitionAd(ad.id, { to: 'dismissed' })
  return { screened, failure: null }
}

// A hand-over ad waits in awaiting_handover, an automatic one in new; both
// lists come newest first, and the oldest are screened first.
async function unscreenedAds(jobApp: JobAppClient): Promise<AdSummary[]> {
  const [waiting, fresh] = await Promise.all([jobApp.listAds('awaiting_handover'), jobApp.listAds('new')])
  const candidates = [
    ...waiting.filter((ad) => ad.sourceMode === 'handover'),
    ...fresh.filter((ad) => ad.sourceMode === 'automatic'),
  ]
  return candidates
    .filter((ad) => ad.prescreen === null)
    .toSorted((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt) || a.id - b.id)
}

export async function runPrescreen(options: PrescreenRunOptions): Promise<PrescreenReport> {
  const { config } = options
  const unscreened = await unscreenedAds(options.jobApp)
  const batch = unscreened.slice(0, config.perRunCap)
  const limits = { limit: config.concurrency, canStart: options.canStart }
  const results = await mapLimit(batch, limits, (ad) => prescreenOne(options, ad))
  const screened = results.flatMap((result) => (result.screened ? [result.screened] : []))
  return {
    promising: screened.filter((ad) => ad.prescreen?.verdict === 'promising'),
    setAside: screened.filter((ad) => ad.prescreen?.verdict === 'not_promising'),
    failed: results.length - screened.length,
    queued: unscreened.length - results.length,
    failedAttempts: results.flatMap((result) => (result.failure ? [result.failure] : [])),
  }
}
