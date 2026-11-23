import type Database from 'better-sqlite3'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { editedName, isMarkdown } from './askMarkers.ts'
import { HttpError } from './httpError.ts'
import type { AttachmentRow } from '../models/attachment.ts'

export interface MarkdownEdit {
  row: AttachmentRow
  text: string
}

/** replacedStoredName is the file to unlink once the caller's transaction commits. */
export interface SavedMarkdown {
  row: AttachmentRow
  replacedStoredName: string | null
}

/** The .md attachments that have no edited copy: an original with a copy is superseded. */
export function currentDocuments(db: Database.Database, applicationId: number): AttachmentRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM attachments a
        WHERE a.application_id = ?
          AND NOT EXISTS (SELECT 1 FROM attachments c WHERE c.edited_from = a.id)
        ORDER BY a.id`,
    )
    .all(applicationId) as AttachmentRow[]
  return rows.filter((row) => isMarkdown(row.original_name))
}

/** A missing file is null: the plan accepts that the DB and uploads/ can drift. */
export function readTextIfExists(uploadsDir: string, row: AttachmentRow): string | null {
  try {
    return readFileSync(join(uploadsDir, row.stored_name), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return null
  }
}

function selectAttachment(db: Database.Database, id: number | bigint): AttachmentRow {
  return db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as AttachmentRow
}

function checkEditable(db: Database.Database, row: AttachmentRow): void {
  if (!isMarkdown(row.original_name)) throw new HttpError(400, 'only .md attachments can be edited')
  const copy = db.prepare('SELECT 1 FROM attachments WHERE edited_from = ?').get(row.id)
  if (copy) throw new HttpError(409, 'attachment has an edited copy; edit that instead')
}

function overwriteCopy(db: Database.Database, copy: AttachmentRow, storedName: string): SavedMarkdown {
  db.prepare(
    "UPDATE attachments SET stored_name = ?, uploaded_at = datetime('now') WHERE id = ?",
  ).run(storedName, copy.id)
  return { row: selectAttachment(db, copy.id), replacedStoredName: copy.stored_name }
}

// The profile mark moves to the copy, so the runner syncs the finished text.
function insertCopy(db: Database.Database, original: AttachmentRow, storedName: string): SavedMarkdown {
  const result = db
    .prepare(
      `INSERT INTO attachments
         (application_id, stored_name, original_name, mime_type, uploaded_at, profile_sync, edited_from)
       VALUES (?, ?, ?, 'text/markdown', datetime('now'), ?, ?)`,
    )
    .run(
      original.application_id,
      storedName,
      editedName(original.original_name),
      original.profile_sync,
      original.id,
    )
  db.prepare('UPDATE attachments SET profile_sync = 0 WHERE id = ?').run(original.id)
  return { row: selectAttachment(db, result.lastInsertRowid), replacedStoredName: null }
}

/**
 * Never overwrites an original: its first save creates an "(edited)" copy, and
 * saving a copy overwrites the copy. The new file is written before the rows
 * change, so a rolled-back save leaves at worst an orphan new file.
 */
export function saveMarkdownText(
  db: Database.Database,
  uploadsDir: string,
  { row, text }: MarkdownEdit,
): SavedMarkdown {
  checkEditable(db, row)
  const storedName = `${randomUUID()}.md`
  writeFileSync(join(uploadsDir, storedName), text)
  if (row.edited_from !== null) return overwriteCopy(db, row, storedName)
  return insertCopy(db, row, storedName)
}
