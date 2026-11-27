import { CliError } from '../../lib/cliError.ts'
import type { HealthResult } from '../../profile/lib/ollama.ts'
import { buildDraft } from './draftApplication.ts'
import type { DraftOutcome } from './draft.ts'
import type { Ad, JobAppClient } from './jobApp.ts'
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
}

// A failed attempt leaves the ad suitable to retry, or fails it on the third.
export type DraftReport =
  | { result: 'drafted'; adId: number; applicationId: number }
  | { result: 'retrying' | 'failed'; failure: FailedAttempt }

// A failure is a same-state transition carrying its category: the server adds
// the attempt and fails the ad on the third.
async function draftOne(options: DraftRunOptions, ad: Ad): Promise<DraftReport> {
  const { jobApp, config, today } = options
  const outcome = await options.write(ad)
  if (outcome.kind === 'failed') {
    const moved = await jobApp.transitionAd(ad.id, { to: 'suitable', error: outcome.category })
    const result = moved.state === 'failed' ? 'failed' : 'retrying'
    return { result, failure: failedAttempt(ad, outcome) }
  }
  const draft = buildDraft(ad, outcome.output, { filePrefix: config.filePrefix, savedOn: today })
  const { applicationId } = await jobApp.draftAd(ad.id, draft)
  return { result: 'drafted', adId: ad.id, applicationId }
}

// With Ollama down, or the ad no longer suitable, the ad is untouched and no
// attempt counted.
export async function draftNamedAd(options: DraftRunOptions, adId: number): Promise<DraftReport> {
  const health = await options.checkHealth()
  if (!health.ok) throw new CliError(1, `drafting skipped: ${health.reason}`)
  const ad = await options.jobApp.getAd(adId)
  if (ad.state !== 'suitable') throw new CliError(1, `ad ${adId} is ${ad.state}, not suitable`)
  return draftOne(options, ad)
}

export function formatDraftReport(report: DraftReport): string {
  if (report.result === 'drafted') return `drafted: ad ${report.adId} as application ${report.applicationId}`
  return `${formatFailedAttempt('drafting', report.failure)} (${report.result})`
}
