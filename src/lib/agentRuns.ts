import type { AgentRun, AgentRunKind } from '../types.ts'

export type RunOutcome = 'succeeded' | 'failed' | 'interrupted'

export const RUN_KIND_LABELS: Record<AgentRunKind, string> = {
  run: 'Daily run',
  collect: 'Mail check',
}

export const RUN_OUTCOME_LABELS: Record<RunOutcome, string> = {
  succeeded: 'Succeeded',
  failed: 'Failed',
  interrupted: 'Interrupted',
}

// A finished run with no exit code was killed, never started, or outlived by a server restart.
export function runOutcome(run: AgentRun): RunOutcome {
  if (run.exitCode === null) return 'interrupted'
  return run.exitCode === 0 ? 'succeeded' : 'failed'
}
