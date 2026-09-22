export const ROLES = ['admin', 'basic'] as const

export type Role = (typeof ROLES)[number]

export interface User {
  id: number
  username: string
  role: Role
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
