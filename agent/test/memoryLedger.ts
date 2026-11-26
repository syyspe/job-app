import type { SpendLedger } from '../runner/lib/apiSpend.ts'

// A spend ledger held in memory, starting at the given month total.
export function memoryLedger(monthUsd = 0): SpendLedger & { total: () => number } {
  let total = monthUsd
  return {
    monthTotal: () => total,
    add: (usd) => {
      total += usd
    },
    total: () => total,
  }
}
