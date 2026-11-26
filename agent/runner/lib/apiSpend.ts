import { z } from 'zod'
import { localDate, readState, writeState } from './state.ts'

const ledgerSchema = z.object({ months: z.record(z.string(), z.number()) })

// Claude API spend per local month, shared by every command on the API
// engine. Each call re-reads the file, so a month rolling over mid-run and a
// parallel command both stay right.
export interface SpendLedger {
  monthTotal: () => number
  add: (usd: number) => void
}

function monthOf(date: Date): string {
  return localDate(date).slice(0, 7)
}

function previousMonth(date: Date): string {
  return monthOf(new Date(date.getFullYear(), date.getMonth() - 1, 1))
}

export function createSpendLedger(path: string, now: () => Date): SpendLedger {
  const read = () => readState(path, ledgerSchema, { months: {} }).months
  return {
    monthTotal: () => read()[monthOf(now())] ?? 0,
    add: (usd) => {
      const date = now()
      const month = monthOf(date)
      const previous = previousMonth(date)
      const months = read()
      const kept: Record<string, number> = { [month]: (months[month] ?? 0) + usd }
      if (months[previous] !== undefined) kept[previous] = months[previous]
      writeState(path, { months: kept })
    },
  }
}
