import type { AdState, SourceMode } from '../types.ts'

// `drafted` is missing on purpose: only POST /api/ads/:id/draft reaches it, so
// no ad is marked drafted without an application.
const TRANSITIONS: Record<AdState, readonly AdState[]> = {
  new: ['title_rejected', 'awaiting_handover', 'ready', 'duplicate', 'failed', 'dismissed'],
  awaiting_handover: ['ready', 'dismissed', 'failed'],
  ready: ['suitable', 'unsuitable', 'duplicate', 'failed', 'dismissed'],
  suitable: ['failed', 'dismissed'],
  drafted: [],
  title_rejected: ['ready', 'dismissed'],
  unsuitable: [],
  duplicate: [],
  dismissed: [],
  failed: ['new', 'awaiting_handover', 'dismissed'],
}

const BODY_CLEARING: readonly AdState[] = [
  'drafted',
  'title_rejected',
  'unsuitable',
  'duplicate',
  'dismissed',
  'failed',
]

const BLANK_ON_ENTRY: readonly AdState[] = ['unsuitable', 'duplicate', 'dismissed']

const BLANK_ONCE_REPORTED: readonly AdState[] = ['drafted', 'title_rejected', 'failed']

const ATTEMPT_STATES: readonly AdState[] = ['new', 'awaiting_handover', 'ready', 'suitable']

export function canTransition(from: AdState, to: AdState): boolean {
  return TRANSITIONS[from].includes(to)
}

export function clearsBody(state: AdState): boolean {
  return BODY_CLEARING.includes(state)
}

export function blanksOnEntry(state: AdState): boolean {
  return BLANK_ON_ENTRY.includes(state)
}

export function blanksOnceReported(state: AdState): boolean {
  return BLANK_ONCE_REPORTED.includes(state)
}

export function recordsAttempts(state: AdState): boolean {
  return ATTEMPT_STATES.includes(state)
}

export function retryTarget(mode: SourceMode): AdState {
  return mode === 'handover' ? 'awaiting_handover' : 'new'
}
