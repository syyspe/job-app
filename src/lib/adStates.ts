import type { AdState, SourceMode } from '../types.ts'

export const AD_STATE_LABELS: Record<AdState, string> = {
  new: 'New',
  awaiting_handover: 'Awaiting hand-over',
  ready: 'Ready',
  suitable: 'Suitable',
  drafted: 'Drafted',
  title_rejected: 'Title rejected',
  unsuitable: 'Unsuitable',
  duplicate: 'Duplicate',
  dismissed: 'Dismissed',
  failed: 'Failed',
}

/** Most urgent first: what waits for the user leads. */
export const AD_STATE_ORDER: readonly AdState[] = [
  'awaiting_handover',
  'failed',
  'suitable',
  'ready',
  'new',
  'drafted',
  'title_rejected',
  'unsuitable',
  'duplicate',
  'dismissed',
]

const HAND_OVER_STATES: readonly AdState[] = ['awaiting_handover', 'title_rejected']

const DISMISSIBLE_STATES: readonly AdState[] = [
  'new',
  'awaiting_handover',
  'title_rejected',
  'ready',
  'suitable',
  'failed',
]

export function canHandOver(state: AdState): boolean {
  return HAND_OVER_STATES.includes(state)
}

export function canDismiss(state: AdState): boolean {
  return DISMISSIBLE_STATES.includes(state)
}

export function retryTarget(mode: SourceMode): AdState {
  return mode === 'handover' ? 'awaiting_handover' : 'new'
}
