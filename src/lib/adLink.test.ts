import { expect, test } from 'vitest'
import { adIdFromHash } from './adLink'

test('an ad hash names its id', () => {
  expect(adIdFromHash('#ad-42')).toBe(42)
})

test.each(['', '#', '#ad-', '#ad-x', '#ad-4x', '#application-4', 'ad-4'])('%j names no ad', (hash) => {
  expect(adIdFromHash(hash)).toBeNull()
})
