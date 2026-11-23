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

// A deadline written any other way is ignored.
function pastDeadline(deadline: string, now: Date): boolean {
  return ISO_DATE.test(deadline) && localDate(now) > deadline
}

type Waiting = Pick<AdSummary, 'firstSeenAt' | 'deadline' | 'fetchRequestedAt'>

// The wait ends waitDays after first seen, or at the end of the deadline day
// if that comes sooner. An ad the user asked to fetch waits for its deadline
// instead, so a click late in the wait isn't dismissed before the run that
// fetches it; without a deadline it keeps the normal wait.
export function handoverExpired(ad: Waiting, { waitDays, now }: ExpiryOptions): boolean {
  if (pastDeadline(ad.deadline, now)) return true
  if (ad.fetchRequestedAt !== null && ISO_DATE.test(ad.deadline)) return false
  return now.getTime() >= parseUtc(ad.firstSeenAt) + waitDays * DAY_MS
}

async function dismissWaiting(jobApp: JobAppClient, options: ExpiryOptions): Promise<number> {
  const waiting = await jobApp.listAds('awaiting_handover')
  const expired = waiting.filter((ad) => handoverExpired(ad, options))
  for (const ad of expired) await jobApp.transitionAd(ad.id, { to: 'dismissed' })
  return expired.length
}

// A hand-over ad's text goes once its deadline has passed, unless it became
// an application; dismissing clears it.
async function dismissExpiredText(jobApp: JobAppClient, now: Date): Promise<number> {
  const withText = [...(await jobApp.listAds('ready')), ...(await jobApp.listAds('suitable'))]
  const expired = withText.filter((ad) => ad.sourceMode === 'handover' && pastDeadline(ad.deadline, now))
  for (const ad of expired) await jobApp.transitionAd(ad.id, { to: 'dismissed' })
  return expired.length
}

export async function dismissExpiredHandovers(jobApp: JobAppClient, options: ExpiryOptions): Promise<number> {
  return (await dismissWaiting(jobApp, options)) + (await dismissExpiredText(jobApp, options.now))
}
