import { expect, test } from 'vitest'
import { formatDate, formatDay, formatTimestamp } from './dates.ts'

test('formats an ISO date in the local timezone, not UTC', () => {
  // Parsed as UTC midnight this would render as 28 Feb west of Greenwich.
  expect(formatDate('2026-03-01')).toBe('1 Mar 2026')
})

test('formats a SQLite timestamp as date and time', () => {
  expect(formatTimestamp('2026-01-15 09:00:00')).toBe('15 Jan 2026, 09:00')
})

test('formats a SQLite timestamp as just its date', () => {
  expect(formatDay('2026-11-21 08:00:00')).toBe('21 Nov 2026')
})
