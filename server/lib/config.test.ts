// @vitest-environment node
import { expect, test } from 'vitest'
import { DEFAULT_PAGE_SIZE, parsePageSize } from './config.ts'

test('an unset PAGE_SIZE means the default', () => {
  expect(parsePageSize(undefined)).toBe(DEFAULT_PAGE_SIZE)
  expect(DEFAULT_PAGE_SIZE).toBe(7)
})

test('a whole number is the page size', () => {
  expect(parsePageSize('12')).toBe(12)
})

test.each(['0', '-3', 'abc', '2.5', ''])('%o is rejected', (raw) => {
  expect(() => parsePageSize(raw)).toThrow(/PAGE_SIZE/)
})
