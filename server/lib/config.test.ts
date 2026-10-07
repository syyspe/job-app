// @vitest-environment node
import { expect, test } from 'vitest'
import { DEFAULT_PAGE_SIZE, parseLogLevel, parsePageSize } from './config.ts'

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

test('an unset LOG_LEVEL means info', () => {
  expect(parseLogLevel(undefined)).toBe('info')
})

test('a level name is the log level', () => {
  expect(parseLogLevel('debug')).toBe('debug')
})

test('an unknown level is rejected', () => {
  expect(() => parseLogLevel('loud')).toThrow('LOG_LEVEL must be one of debug, info, warn, error, silent')
})
