import { Router } from 'express'
import type { Request, Response } from 'express'
import type Database from 'better-sqlite3'
import { unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { STATUSES } from '../types.ts'
import type { Application, Attachment } from '../types.ts'

export interface ApplicationRow {
  id: number
  company: string
  role: string
  date_applied: string
  status: string
  link: string
  notes: string
}

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

function toApplication(
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

interface ApplicationInput {
  company: string
  role: string
  dateApplied: string
  status: string
  link: string
  notes: string
}

function validateInput(body: unknown): ApplicationInput | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as Record<string, unknown>
  const company = typeof b.company === 'string' ? b.company : ''
  const role = typeof b.role === 'string' ? b.role : ''
  const dateApplied = typeof b.dateApplied === 'string' ? b.dateApplied : ''
  const status = typeof b.status === 'string' ? b.status : ''
  const link = typeof b.link === 'string' ? b.link : ''
  const notes = typeof b.notes === 'string' ? b.notes : ''

  if (!company || !role) return null
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) return null
  if (status !== 'draft' && !dateApplied) return null

  return { company, role, dateApplied, status, link, notes }
}

/** Ignores a missing file: the plan accepts that the DB and uploads/ can drift. */
export function unlinkIfExists(path: string): void {
  try {
    unlinkSync(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

type AttachmentsForApplication = Database.Statement<[number], AttachmentRow>

function listHandler(db: Database.Database, attachments: AttachmentsForApplication) {
  return (_req: Request, res: Response) => {
    const rows = db.prepare('SELECT * FROM applications').all() as ApplicationRow[]
    const applications = rows.map((row) =>
      toApplication(row, attachments.all(row.id)),
    )
    res.json(applications)
  }
}

function createHandler(db: Database.Database) {
  return (req: Request, res: Response) => {
    const input = validateInput(req.body)
    if (!input) {
      res.status(400).json({ error: 'invalid application' })
      return
    }

    const result = db
      .prepare(
        `INSERT INTO applications (company, role, date_applied, status, link, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(input.company, input.role, input.dateApplied, input.status, input.link, input.notes)

    const row = db
      .prepare('SELECT * FROM applications WHERE id = ?')
      .get(result.lastInsertRowid) as ApplicationRow
    res.status(201).json(toApplication(row, []))
  }
}

function updateHandler(db: Database.Database, attachments: AttachmentsForApplication) {
  return (req: Request, res: Response) => {
    const id = Number(req.params.id)
    const input = validateInput(req.body)
    if (!input) {
      res.status(400).json({ error: 'invalid application' })
      return
    }

    const result = db
      .prepare(
        `UPDATE applications
         SET company = ?, role = ?, date_applied = ?, status = ?, link = ?, notes = ?
         WHERE id = ?`,
      )
      .run(input.company, input.role, input.dateApplied, input.status, input.link, input.notes, id)

    if (result.changes === 0) {
      res.status(404).json({ error: 'not found' })
      return
    }

    const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(id) as ApplicationRow
    res.json(toApplication(row, attachments.all(id)))
  }
}

function deleteHandler(
  db: Database.Database,
  uploadsDir: string,
  attachments: AttachmentsForApplication,
) {
  return (req: Request, res: Response) => {
    const id = Number(req.params.id)
    const attachmentRows = attachments.all(id)

    db.prepare('DELETE FROM applications WHERE id = ?').run(id)

    for (const attachment of attachmentRows) {
      unlinkIfExists(join(uploadsDir, attachment.stored_name))
    }

    res.status(204).end()
  }
}

export function createApplicationsRouter(
  db: Database.Database,
  uploadsDir: string,
): Router {
  const router = Router()
  const attachments: AttachmentsForApplication = db.prepare(
    'SELECT * FROM attachments WHERE application_id = ?',
  )

  router.get('/applications', listHandler(db, attachments))
  router.post('/applications', createHandler(db))
  router.put('/applications/:id', updateHandler(db, attachments))
  router.delete('/applications/:id', deleteHandler(db, uploadsDir, attachments))

  return router
}
