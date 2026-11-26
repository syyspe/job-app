import type { AdSummary } from './jobApp.ts'
import { oneLine } from './oneLine.ts'

// One failed model step on one ad in this run, for the run output and the
// summary. The detail never reaches the server.
export interface FailedAttempt {
  adId: number
  title: string
  source: string
  category: string
  detail?: string
}

export function failedAttempt(ad: AdSummary, failure: { category: string; detail?: string }): FailedAttempt {
  return { adId: ad.id, title: ad.title, source: ad.source, category: failure.category, detail: failure.detail }
}

export function formatFailedAttempt(step: string, { title, source, category, detail }: FailedAttempt): string {
  const line = `${step} failed: ${title}, ${source}: ${category}`
  return oneLine(detail ? `${line} — ${detail}` : line)
}
