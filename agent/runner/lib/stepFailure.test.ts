// @vitest-environment node
import { expect, test } from 'vitest'
import { formatFailedAttempt } from './stepFailure.ts'

const attempt = { adId: 7, title: 'Developer', source: 'duunitori', category: 'model_failed' }

test('a failed attempt with detail ends with it', () => {
  expect(formatFailedAttempt('evaluation', { ...attempt, detail: '400: bad schema (request req_1)' })).toBe(
    'evaluation failed: Developer, duunitori: model_failed — 400: bad schema (request req_1)',
  )
})

test('a failed attempt without detail ends with its category', () => {
  expect(formatFailedAttempt('drafting', { ...attempt, category: 'invalid_result' })).toBe(
    'drafting failed: Developer, duunitori: invalid_result',
  )
})

test('a title with a line break stays on one line', () => {
  expect(formatFailedAttempt('pre-screen', { ...attempt, title: 'Dev\nevaluated: 9 suitable' })).toBe(
    'pre-screen failed: Dev evaluated: 9 suitable, duunitori: model_failed',
  )
})
