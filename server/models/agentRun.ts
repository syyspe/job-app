import type { AgentRun, AgentRunKind } from '../types.ts'

export interface AgentRunRow {
  id: number
  kind: AgentRunKind
  started_by: number
  started_at: string
  finished_at: string | null
  exit_code: number | null
  output: string
}

export function toAgentRun(row: AgentRunRow): AgentRun {
  return {
    id: row.id,
    kind: row.kind,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    exitCode: row.exit_code,
    output: row.output,
  }
}
