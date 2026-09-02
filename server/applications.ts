import { Router } from 'express'
import type Database from 'better-sqlite3'
import { unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { STATUSES } from './types.ts'
import type { Application, Attachment } from './types.ts'

interface ApplicationRow {
  id: number
  company: string
  role: string
  date_applied: string
  status: string
  link: string
  notes: string
}

interface AttachmentRow {
  id: number
  application_id: number
  stored_name: string
  original_name: string
  mime_type: string
}

function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    applicationId: row.application_id,
    storedName: row.stored_name,
    originalName: row.original_name,
    mimeType: row.mime_type,
  }
}

function toApplication(row: ApplicationRow, attachmentRows: AttachmentRow[]): Application {
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

  if (!company || !role || !dateApplied) return null
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) return null

  return { company, role, dateApplied, status, link, notes }
}

export function createApplicationsRouter(db: Database.Database, dataDir: string): Router {
  const router = Router()
  const attachmentsForApplication = db.prepare('SELECT * FROM attachments WHERE application_id = ?')

  router.get('/applications', (_req, res) => {
    const rows = db.prepare('SELECT * FROM applications').all() as ApplicationRow[]
    const applications = rows.map((row) =>
      toApplication(row, attachmentsForApplication.all(row.id) as AttachmentRow[]),
    )
    res.json(applications)
  })

  router.post('/applications', (req, res) => {
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
  })

  router.put('/applications/:id', (req, res) => {
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
    const attachmentRows = attachmentsForApplication.all(id) as AttachmentRow[]
    res.json(toApplication(row, attachmentRows))
  })

  router.delete('/applications/:id', (req, res) => {
    const id = Number(req.params.id)
    const attachmentRows = attachmentsForApplication.all(id) as AttachmentRow[]

    db.prepare('DELETE FROM applications WHERE id = ?').run(id)

    for (const attachment of attachmentRows) {
      unlinkSync(join(dataDir, 'uploads', attachment.stored_name))
    }

    res.status(204).end()
  })

  return router
}
