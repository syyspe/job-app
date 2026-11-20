import type { JobAppClient } from './jobApp.ts'
import { screenTarget } from './titleRules.ts'

export interface ScreenCounts {
  titleRejected: number
  awaitingHandover: number
  leftNew: number
}

// Moves new ads by title and mode; collect and evaluate both run it.
export async function screenNewAds(jobApp: JobAppClient, phrases: string[]): Promise<ScreenCounts> {
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
