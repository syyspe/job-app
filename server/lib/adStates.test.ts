// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { AD_STATES } from '../types.ts'
import type { AdState } from '../types.ts'
import {
  blanksOnceReported,
  blanksOnEntry,
  canTransition,
  clearsBody,
  recordsAttempts,
  retryTarget,
} from './adStates.ts'

const ALLOWED: Record<AdState, AdState[]> = {
  new: ['title_rejected', 'awaiting_handover', 'ready', 'duplicate', 'failed', 'dismissed'],
  awaiting_handover: ['ready', 'dismissed'],
  ready: ['suitable', 'unsuitable', 'duplicate', 'failed', 'dismissed'],
  suitable: ['failed', 'dismissed'],
  drafted: [],
  title_rejected: ['ready', 'dismissed'],
  unsuitable: [],
  duplicate: [],
  dismissed: [],
  failed: ['new', 'awaiting_handover', 'dismissed'],
}

describe.each(AD_STATES)('from %s', (from) => {
  test.each(AD_STATES)('to %s', (to) => {
    expect(canTransition(from, to)).toBe(ALLOWED[from].includes(to))
  })
})

test('drafted is never a transition target', () => {
  for (const from of AD_STATES) expect(canTransition(from, 'drafted')).toBe(false)
})

test('only the states that hold no ad text for later clear the body', () => {
  const clearing = AD_STATES.filter(clearsBody)
  expect(clearing.sort()).toEqual(
    ['dismissed', 'drafted', 'duplicate', 'failed', 'title_rejected', 'unsuitable'].sort(),
  )
})

test('states no summary covers blank on entry', () => {
  expect(AD_STATES.filter(blanksOnEntry).sort()).toEqual(['dismissed', 'duplicate', 'unsuitable'])
})

test('states a summary covers blank once reported', () => {
  expect(AD_STATES.filter(blanksOnceReported).sort()).toEqual([
    'drafted',
    'failed',
    'title_rejected',
  ])
})

test('attempts are recorded only while work is pending', () => {
  expect(AD_STATES.filter(recordsAttempts).sort()).toEqual(['new', 'ready', 'suitable'])
})

test('a retry returns the ad to where its source mode starts', () => {
  expect(retryTarget('automatic')).toBe('new')
  expect(retryTarget('handover')).toBe('awaiting_handover')
})
