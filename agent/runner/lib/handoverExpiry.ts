import type { AdSummary, JobAppClient } from './jobApp.ts'
import { localDate } from './state.ts'

export interface ExpiryOptions {
  waitDays: number
  now: Date
}

const DAY_MS = 24 * 60 * 60 * 1000
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// first_seen_at is SQLite's UTC 'YYYY-MM-DD HH:MM:SS'.
function parseUtc(sqliteTime: string): number {
  return Date.parse(`${sqliteTime.replace(' ', 'T')}Z`)
}

// The wait ends waitDays after first seen, or at the end of the deadline day
// if that comes sooner. A deadline written any other way is ignored.
export function handoverExpired(ad: Pick<AdSummary, 'firstSeenAt' | 'deadline'>, { waitDays, now }: ExpiryOptions): boolean {
  if (now.getTime() >= parseUtc(ad.firstSeenAt) + waitDays * DAY_MS) return true
  return ISO_DATE.test(ad.deadline) && localDate(now) > ad.deadline
}

export async function dismissExpiredHandovers(jobApp: JobAppClient, options: ExpiryOptions): Promise<number> {
  const waiting = await jobApp.listAds('awaiting_handover')
  const expired = waiting.filter((ad) => handoverExpired(ad, options))
  for (const ad of expired) await jobApp.transitionAd(ad.id, { to: 'dismissed' })
  return expired.length
}
