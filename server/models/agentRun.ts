import type { AgentRun, AgentRunKind } from '../types.ts'

export interface AgentRunRow {
  id: number
  kind: AgentRunKind
  ad_id: number | null
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
    adId: row.ad_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    exitCode: row.exit_code,
    output: row.output,
  }
}
