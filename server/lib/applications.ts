import type Database from 'better-sqlite3'
import type { ApplicationRow } from '../models/application.ts'
import type { AttachmentRow } from '../models/attachment.ts'
import type { ApplicationInput } from './validation.ts'

/** Callers have already checked the application belongs to the session user. */
export function touchApplication(db: Database.Database, id: number): void {
  db.prepare("UPDATE applications SET updated_at = datetime('now') WHERE id = ?").run(id)
}

export function insertApplication(
  db: Database.Database,
  userId: number,
  input: ApplicationInput,
): ApplicationRow {
  const result = db
    .prepare(
      `INSERT INTO applications
         (user_id, company, role, date_applied, deadline, status, link, notes,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    )
    .run(
      userId,
      input.company,
      input.role,
      input.dateApplied,
      input.deadline,
      input.status,
      input.link,
      input.notes,
    )
  return db
    .prepare('SELECT * FROM applications WHERE id = ?')
    .get(result.lastInsertRowid) as ApplicationRow
}

/** Callers have already checked the application belongs to the session user. */
export function insertAttachment(
  db: Database.Database,
  applicationId: number,
  file: Express.Multer.File,
): AttachmentRow {
  const result = db
    .prepare(
      `INSERT INTO attachments
         (application_id, stored_name, original_name, mime_type, uploaded_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
    )
    .run(applicationId, file.filename, file.originalname, file.mimetype)
  return db
    .prepare('SELECT * FROM attachments WHERE id = ?')
    .get(result.lastInsertRowid) as AttachmentRow
}
