import { expect, test } from 'vitest'
import { formatDate, formatTimestamp } from './dates.ts'

test('formats an ISO date in the local timezone, not UTC', () => {
  // Parsed as UTC midnight this would render as 28 Feb west of Greenwich.
  expect(formatDate('2026-03-01')).toBe('1 Mar 2026')
})

test('formats a SQLite timestamp as date and time', () => {
  expect(formatTimestamp('2026-01-15 09:00:00')).toBe('15 Jan 2026, 09:00')
})
