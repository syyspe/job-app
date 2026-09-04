import type { Attachment } from '../types.ts'

export interface AttachmentRow {
  id: number
  application_id: number
  stored_name: string
  original_name: string
  mime_type: string
}

export function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    applicationId: row.application_id,
    storedName: row.stored_name,
    originalName: row.original_name,
    mimeType: row.mime_type,
  }
}
