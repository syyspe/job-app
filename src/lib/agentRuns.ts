import type { AgentRun, AgentRunKind } from '../types.ts'

export type RunOutcome = 'succeeded' | 'failed' | 'interrupted'

export const RUN_KIND_LABELS: Record<AgentRunKind, string> = {
  run: 'Daily run',
  collect: 'Mail check',
  draft: 'Draft',
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

export interface RunSpend {
  run: string
  month: string
}

const SPEND_LINE = /^api: \$(\d+\.\d{2}) run, \$(\d+\.\d{2}) month$/

// The daily run's last stdout line under the API engine. The last match,
// since stderr failure lines can follow it in the merged output.
export function runSpend(output: string): RunSpend | null {
  const line = output
    .split('\n')
    .reverse()
    .map((text) => SPEND_LINE.exec(text))
    .find((match) => match !== null)
  if (!line) return null
  return { run: line[1], month: line[2] }
}
