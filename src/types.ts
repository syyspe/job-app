export const ROLES = ['admin', 'basic'] as const

export type Role = (typeof ROLES)[number]

export interface User {
  id: number
  username: string
  role: Role
}

export const AGENT_RUN_KINDS = ['run', 'collect'] as const

export type AgentRunKind = (typeof AGENT_RUN_KINDS)[number]

export interface AgentRun {
  id: number
  kind: AgentRunKind
  startedAt: string
  finishedAt: string | null
  exitCode: number | null
  output: string
}

export interface AgentRuns {
  current: AgentRun | null
  recent: AgentRun[]
}

export interface AppConfig {
  pageSize: number
}

export const STATUSES = [
  'draft',
  'applied',
  'screening',
  'interview',
  'offer',
  'rejected',
] as const

export type Status = (typeof STATUSES)[number]

export interface Attachment {
  id: number
  applicationId: number
  storedName: string
  originalName: string
  mimeType: string
  uploadedAt: string
  profileSyncPending: boolean
  editedFromId: number | null
}

export interface OpenQuestion {
  id: string
  text: string | null
}

export interface Application {
  id: number
  company: string
  role: string
  dateApplied: string
  deadline: string
  status: Status
  link: string
  notes: string
  archived: boolean
  createdAt: string
  updatedAt: string
  attachments: Attachment[]
}

export interface ApplicationInput {
  company: string
  role: string
  dateApplied: string
  deadline: string
  status: Status
  link: string
  notes: string
}

export interface UserInput {
  username: string
  password: string
  role: Role
}

export const AD_STATES = [
  'new',
  'awaiting_handover',
  'ready',
  'suitable',
  'drafted',
  'title_rejected',
  'unsuitable',
  'duplicate',
  'dismissed',
  'failed',
] as const

export type AdState = (typeof AD_STATES)[number]

export const SOURCE_MODES = ['automatic', 'handover'] as const

export type SourceMode = (typeof SOURCE_MODES)[number]

export interface AdEvaluation {
  verdict: 'suitable' | 'unsuitable'
  fitSummary: string
  reasons: string[]
}

export interface AdPrescreen {
  verdict: 'promising' | 'not_promising'
  reason: string
}

export interface AdSummary {
  id: number
  source: string
  sourceMode: SourceMode
  externalId: string
  url: string
  title: string
  company: string
  location: string
  deadline: string
  state: AdState
  evaluation: AdEvaluation | null
  prescreen: AdPrescreen | null
  fetchRequestedAt: string | null
  applicationId: number | null
  duplicateOf: number | null
  attempts: number
  lastError: string | null
  firstSeenAt: string
  updatedAt: string
  reportedAt: string | null
}

export interface AdHandoverInput {
  text: string
  title: string
  company: string
}
