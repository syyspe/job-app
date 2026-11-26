import type { SpendLedger } from './apiSpend.ts'
import type { ModelPrice } from './runnerConfig.ts'

export interface TokenUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number | null
  cache_read_input_tokens: number | null
}

// What a run spent on the Claude API, and the month's total so far.
export interface ApiSpend {
  runUsd: number
  monthUsd: number
  monthlyUsd: number
}

// What a run's model steps ask before each new step starts.
export interface StepBudget {
  canStart(): boolean
  // Why no new step may start, or null while they may.
  stopReason(): string | null
  // Null unless the run made an API call.
  spend(): ApiSpend | null
}

export interface RunBudget extends StepBudget {
  charge(model: string, usage: TokenUsage): void
  stop(reason: string): void
}

export interface RunBudgetOptions {
  perRunUsd: number
  monthlyUsd: number
  prices: Record<string, ModelPrice>
  ledger: SpendLedger
}

export const UNLIMITED: StepBudget = { canStart: () => true, stopReason: () => null, spend: () => null }

export function responseCost(price: ModelPrice, usage: TokenUsage): number {
  const dollars =
    usage.input_tokens * price.inputPerMTok +
    usage.output_tokens * price.outputPerMTok +
    (usage.cache_creation_input_tokens ?? 0) * price.cacheWritePerMTok +
    (usage.cache_read_input_tokens ?? 0) * price.cacheReadPerMTok
  return dollars / 1e6
}

// Config guarantees a price for every model a step uses.
export function createRunBudget(options: RunBudgetOptions): RunBudget {
  const { perRunUsd, monthlyUsd, prices, ledger } = options
  let spent = 0
  let calls = 0
  let stopped: string | null = null
  const stopReason = () => {
    if (stopped) return stopped
    if (spent >= perRunUsd) return `API run cap reached at $${perRunUsd.toFixed(2)}`
    const month = ledger.monthTotal()
    if (month >= monthlyUsd) return `API monthly cap reached: $${month.toFixed(2)} of $${monthlyUsd.toFixed(2)}`
    return null
  }
  return {
    canStart: () => stopReason() === null,
    stopReason,
    spend: () => (calls === 0 ? null : { runUsd: spent, monthUsd: ledger.monthTotal(), monthlyUsd }),
    charge: (model, usage) => {
      const cost = responseCost(prices[model], usage)
      spent += cost
      calls += 1
      ledger.add(cost)
    },
    stop: (reason) => {
      stopped ??= reason
    },
  }
}
