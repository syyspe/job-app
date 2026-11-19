import type { AdSummary } from './jobApp.ts'

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Whole words only, with letters and digits in any script as word characters,
// so "intern" does not match "international" and "ä" never ends a word.
export function matchesReject(title: string, phrases: string[]): boolean {
  return phrases.some((phrase) =>
    new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(phrase)}(?![\\p{L}\\p{N}])`, 'iu').test(title),
  )
}

export type ScreenTarget = 'title_rejected' | 'awaiting_handover'

// null leaves the ad in `new`: an automatic ad that passes waits for its fetch.
export function screenTarget(ad: Pick<AdSummary, 'title' | 'sourceMode'>, phrases: string[]): ScreenTarget | null {
  if (matchesReject(ad.title, phrases)) return 'title_rejected'
  return ad.sourceMode === 'handover' ? 'awaiting_handover' : null
}
