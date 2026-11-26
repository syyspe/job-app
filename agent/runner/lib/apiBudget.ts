import type { ModelPrice } from './runnerConfig.ts'

export interface TokenUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number | null
  cache_read_input_tokens: number | null
}

// What a run's model steps ask before each new step starts.
export interface StepBudget {
  canStart(): boolean
  // Why no new step may start, or null while they may.
  stopReason(): string | null
}

export interface RunBudget extends StepBudget {
  charge(model: string, usage: TokenUsage): void
  stop(reason: string): void
}

export const UNLIMITED: StepBudget = { canStart: () => true, stopReason: () => null }

export function responseCost(price: ModelPrice, usage: TokenUsage): number {
  const dollars =
    usage.input_tokens * price.inputPerMTok +
    usage.output_tokens * price.outputPerMTok +
    (usage.cache_creation_input_tokens ?? 0) * price.cacheWritePerMTok +
    (usage.cache_read_input_tokens ?? 0) * price.cacheReadPerMTok
  return dollars / 1e6
}

// Config guarantees a price for every model a step uses.
export function createRunBudget(options: { perRunUsd: number; prices: Record<string, ModelPrice> }): RunBudget {
  let spent = 0
  let stopped: string | null = null
  const stopReason = () => {
    if (stopped) return stopped
    if (spent >= options.perRunUsd) return `API run cap reached at $${options.perRunUsd.toFixed(2)}`
    return null
  }
  return {
    canStart: () => stopReason() === null,
    stopReason,
    charge: (model, usage) => {
      spent += responseCost(options.prices[model], usage)
    },
    stop: (reason) => {
      stopped ??= reason
    },
  }
}
