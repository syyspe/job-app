import type { AdSummary, JobAppClient } from './jobApp.ts'
import type { FetchResult } from './sources/types.ts'
import type { RunnerState } from './state.ts'

export type FetchOutcome = 'ready' | 'duplicate' | 'gone' | 'retrying' | 'failed' | 'blocked'

export type FetchCounts = Record<FetchOutcome, number>

export function noFetches(): FetchCounts {
  return { ready: 0, duplicate: 0, gone: 0, retrying: 0, failed: 0, blocked: 0 }
}

// A failure is a same-state transition, from new or awaiting_handover alike:
// the server counts the attempt and fails the ad on the third. A block moves
// nothing and costs no attempt.
export async function applyFetch(jobApp: JobAppClient, ad: AdSummary, result: FetchResult): Promise<FetchOutcome> {
  if (result.kind === 'blocked') return 'blocked'
  if (result.kind === 'gone') {
    await jobApp.transitionAd(ad.id, { to: 'failed', error: 'gone' })
    return 'gone'
  }
  if (result.kind === 'failed') {
    const moved = await jobApp.transitionAd(ad.id, { to: ad.state, error: result.category })
    return moved.state === 'failed' ? 'failed' : 'retrying'
  }
  const { text, company, deadline } = result
  const moved = await jobApp.transitionAd(ad.id, { to: 'ready', body: text, company, deadline })
  return moved.state === 'duplicate' ? 'duplicate' : 'ready'
}

// One blocked failure per source and day.
export function recordBlocked(state: RunnerState, source: string, today: string): void {
  const recorded = state.readFailures().some((f) => f.source === source && f.date === today && f.kind === 'blocked')
  if (!recorded) state.addFailure({ source, date: today, kind: 'blocked' })
}
