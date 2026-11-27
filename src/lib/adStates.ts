import type { AdState, AdSummary, SourceMode } from '../types.ts'

/**
 * What the inbox lists: the stored states grouped under the summary email's
 * words. In-progress and closed ads belong to no group and aren't listed.
 */
export type AdGroup = 'kept' | 'failed' | 'drafted' | 'set_aside'

/** Most urgent first: what waits for the user leads. */
export const AD_GROUPS: readonly AdGroup[] = ['kept', 'failed', 'drafted', 'set_aside']

export const AD_GROUP_LABELS: Record<AdGroup, string> = {
  kept: 'Kept',
  failed: 'Failed',
  drafted: 'Drafted',
  set_aside: 'Set aside',
}

const STATE_GROUPS: Partial<Record<AdState, AdGroup>> = {
  suitable: 'kept',
  failed: 'failed',
  drafted: 'drafted',
  title_rejected: 'set_aside',
  unsuitable: 'set_aside',
}

function prescreenDismissed(ad: AdSummary): boolean {
  return ad.state === 'dismissed' && ad.prescreen?.verdict === 'not_promising'
}

export function adGroup(ad: AdSummary): AdGroup | null {
  if (prescreenDismissed(ad)) return 'set_aside'
  return STATE_GROUPS[ad.state] ?? null
}

/** Which step dropped a set-aside ad, and why. */
export function setAsideBy(ad: AdSummary): string | null {
  if (ad.state === 'title_rejected') return 'Set aside by the title rules.'
  if (prescreenDismissed(ad)) return `Set aside by the pre-screen — ${ad.prescreen?.reason}`
  if (ad.state === 'unsuitable') return `Set aside by the evaluation — ${ad.evaluation?.fitSummary}`
  return null
}

export function canDismiss(group: AdGroup | null): boolean {
  return group === 'kept' || group === 'failed'
}

/**
 * The Draft button on one row: hidden (none), clickable (ready), held back by
 * another run (busy), or replaced by its own run's progress (running).
 */
export type DraftStatus = 'none' | 'ready' | 'busy' | 'running'

/** The kept ads a Draft click can turn into a draft application. */
export function canDraft(state: AdState): boolean {
  return state === 'suitable'
}

export function retryTarget(mode: SourceMode): AdState {
  return mode === 'handover' ? 'awaiting_handover' : 'new'
}
