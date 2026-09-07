import type { Application } from '../types.ts'
import type { ApplicationInput } from '../lib/validation.ts'
import { toAttachment } from './attachment.ts'
import type { AttachmentRow } from './attachment.ts'

export interface ApplicationRow {
  id: number
  company: string
  role: string
  date_applied: string
  deadline: string
  status: string
  link: string
  notes: string
  created_at: string
  updated_at: string
}

export function toApplication(
  row: ApplicationRow,
  attachmentRows: AttachmentRow[],
): Application {
  return {
    id: row.id,
    company: row.company,
    role: row.role,
    dateApplied: row.date_applied,
    deadline: row.deadline,
    status: row.status as Application['status'],
    link: row.link,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attachments: attachmentRows.map(toAttachment),
  }
}

export function matchesInput(row: ApplicationRow, input: ApplicationInput): boolean {
  return (
    row.company === input.company &&
    row.role === input.role &&
    row.date_applied === input.dateApplied &&
    row.deadline === input.deadline &&
    row.status === input.status &&
    row.link === input.link &&
    row.notes === input.notes
  )
}
