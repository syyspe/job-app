import type { Application } from '../types.ts'
import { toAttachment } from './attachment.ts'
import type { AttachmentRow } from './attachment.ts'

export interface ApplicationRow {
  id: number
  company: string
  role: string
  date_applied: string
  status: string
  link: string
  notes: string
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
    status: row.status as Application['status'],
    link: row.link,
    notes: row.notes,
    attachments: attachmentRows.map(toAttachment),
  }
}
