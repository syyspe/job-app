import { expect, test } from 'vitest'
import { sourceLabel } from './sources.ts'

test('a known source reads as its name', () => {
  expect(sourceLabel('academicwork')).toBe('Academic Work')
})

test('an unknown source reads as its slug', () => {
  expect(sourceLabel('e2e')).toBe('e2e')
})
