export interface User {
  id: number
  username: string
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
  status: Status
  link: string
  notes: string
  attachments: Attachment[]
}

export interface ApplicationInput {
  company: string
  role: string
  dateApplied: string
  status: Status
  link: string
  notes: string
}
