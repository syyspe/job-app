import { expect, test } from 'vitest'
import { AD_GROUP_LABELS, adGroup, setAsideBy } from './adStates'
import type { AdEvaluation, AdState, AdSummary } from '../types'

function sampleAd(overrides: Partial<AdSummary> = {}): AdSummary {
  return {
    id: 1,
    source: 'duunitori',
    sourceMode: 'automatic',
    externalId: 'abc',
    url: 'https://example.com/ad/1',
    title: 'Test Lead',
    company: 'Acme',
    location: 'Helsinki',
    deadline: '',
    state: 'new',
    evaluation: null,
    prescreen: null,
    fetchRequestedAt: null,
    applicationId: null,
    duplicateOf: null,
    attempts: 0,
    lastError: null,
    firstSeenAt: '2026-11-01 08:00:00',
    updatedAt: '2026-11-01 08:00:00',
    reportedAt: null,
    ...overrides,
  }
}

const notPromising = { verdict: 'not_promising', reason: 'Sales role' } as const

test.each<[AdState, string | null]>([
  ['suitable', 'kept'],
  ['failed', 'failed'],
  ['drafted', 'drafted'],
  ['title_rejected', 'set_aside'],
  ['unsuitable', 'set_aside'],
  ['new', null],
  ['awaiting_handover', null],
  ['ready', null],
  ['duplicate', null],
  ['dismissed', null],
])('a %s ad belongs to group %s', (state, group) => {
  expect(adGroup(sampleAd({ state }))).toBe(group)
})

test('an ad the pre-screen dismissed is set aside', () => {
  expect(adGroup(sampleAd({ state: 'dismissed', prescreen: notPromising }))).toBe('set_aside')
})

test('an ad dismissed after a promising pre-screen is not listed', () => {
  const prescreen = { verdict: 'promising', reason: 'Fits' } as const
  expect(adGroup(sampleAd({ state: 'dismissed', prescreen }))).toBeNull()
})

test('says the title rules set an ad aside', () => {
  expect(setAsideBy(sampleAd({ state: 'title_rejected' }))).toBe('Set aside by the title rules.')
})

test('says the pre-screen set an ad aside, and why', () => {
  const ad = sampleAd({ state: 'dismissed', prescreen: notPromising })
  expect(setAsideBy(ad)).toBe('Set aside by the pre-screen — Sales role')
})

test('says the evaluation set an ad aside, with its fit summary', () => {
  const evaluation: AdEvaluation = { verdict: 'unsuitable', fitSummary: 'Too junior', reasons: [] }
  const ad = sampleAd({ state: 'unsuitable', evaluation })
  expect(setAsideBy(ad)).toBe('Set aside by the evaluation — Too junior')
})

test('a kept ad was not set aside', () => {
  expect(setAsideBy(sampleAd({ state: 'suitable' }))).toBeNull()
})

test('the group labels use the summary email words', () => {
  // summary.ts's subject reads "N kept, M set aside".
  expect(AD_GROUP_LABELS.kept.toLowerCase()).toBe('kept')
  expect(AD_GROUP_LABELS.set_aside.toLowerCase()).toBe('set aside')
})
