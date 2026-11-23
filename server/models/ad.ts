import type { Ad, AdEvaluation, AdPrescreen, AdState, AdSummary, SourceMode } from '../types.ts'

export interface AdRow {
  id: number
  user_id: number
  source: string
  source_mode: SourceMode
  external_id: string
  url: string
  canonical_url: string
  title: string
  company: string
  location: string
  deadline: string
  state: AdState
  body: string | null
  evaluation: string | null
  prescreen: string | null
  fetch_requested_at: string | null
  application_id: number | null
  duplicate_of: number | null
  attempts: number
  last_error: string | null
  first_seen_at: string
  updated_at: string
  reported_at: string | null
}

export function toAdSummary(row: AdRow): AdSummary {
  return {
    id: row.id,
    source: row.source,
    sourceMode: row.source_mode,
    externalId: row.external_id,
    url: row.url,
    title: row.title,
    company: row.company,
    location: row.location,
    deadline: row.deadline,
    state: row.state,
    evaluation: row.evaluation ? (JSON.parse(row.evaluation) as AdEvaluation) : null,
    prescreen: row.prescreen ? (JSON.parse(row.prescreen) as AdPrescreen) : null,
    fetchRequestedAt: row.fetch_requested_at,
    applicationId: row.application_id,
    duplicateOf: row.duplicate_of,
    attempts: row.attempts,
    lastError: row.last_error,
    firstSeenAt: row.first_seen_at,
    updatedAt: row.updated_at,
    reportedAt: row.reported_at,
  }
}

export function toAd(row: AdRow): Ad {
  return { ...toAdSummary(row), body: row.body }
}
