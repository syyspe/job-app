import { Router } from 'express'
import type { Request, Response } from 'express'
import type Database from 'better-sqlite3'
import { join } from 'node:path'
import { toApplication, matchesInput } from '../models/application.ts'
import type { ApplicationRow } from '../models/application.ts'
import type { AttachmentRow } from '../models/attachment.ts'
import { validateInput } from '../lib/validation.ts'
import { unlinkIfExists } from '../lib/files.ts'
import { touchApplication } from '../lib/applications.ts'

type AttachmentsForApplication = Database.Statement<[number, number], AttachmentRow>

function listHandler(db: Database.Database, attachments: AttachmentsForApplication) {
  return (req: Request, res: Response) => {
    const rows = db
      .prepare('SELECT * FROM applications WHERE user_id = ?')
      .all(req.userId) as ApplicationRow[]
    const applications = rows.map((row) =>
      toApplication(row, attachments.all(row.id, req.userId)),
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
        `INSERT INTO applications
           (user_id, company, role, date_applied, deadline, status, link, notes,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      )
      .run(
        req.userId,
        input.company,
        input.role,
        input.dateApplied,
        input.deadline,
        input.status,
        input.link,
        input.notes,
      )

    const row = db
      .prepare('SELECT * FROM applications WHERE id = ?')
      .get(result.lastInsertRowid) as ApplicationRow
    res.status(201).json(toApplication(row, []))
  }
}

function findOwnedApplication(
  db: Database.Database,
  id: number,
  userId: number,
): ApplicationRow | undefined {
  return db
    .prepare('SELECT * FROM applications WHERE id = ? AND user_id = ?')
    .get(id, userId) as ApplicationRow | undefined
}

function updateHandler(db: Database.Database, attachments: AttachmentsForApplication) {
  return (req: Request, res: Response) => {
    const id = Number(req.params.id)
    const input = validateInput(req.body)
    if (!input) {
      res.status(400).json({ error: 'invalid application' })
      return
    }

    const existing = findOwnedApplication(db, id, req.userId)
    if (!existing) {
      res.status(404).json({ error: 'not found' })
      return
    }

    db.prepare(
      `UPDATE applications
       SET company = ?, role = ?, date_applied = ?, deadline = ?, status = ?, link = ?, notes = ?
       WHERE id = ? AND user_id = ?`,
    ).run(
      input.company,
      input.role,
      input.dateApplied,
      input.deadline,
      input.status,
      input.link,
      input.notes,
      id,
      req.userId,
    )

    if (!matchesInput(existing, input)) touchApplication(db, id)

    const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(id) as ApplicationRow
    res.json(toApplication(row, attachments.all(id, req.userId)))
  }
}

function deleteHandler(
  db: Database.Database,
  uploadsDir: string,
  attachments: AttachmentsForApplication,
) {
  return (req: Request, res: Response) => {
    const id = Number(req.params.id)
    const attachmentRows = attachments.all(id, req.userId)

    const result = db
      .prepare('DELETE FROM applications WHERE id = ? AND user_id = ?')
      .run(id, req.userId)

    if (result.changes === 0) {
      res.status(404).json({ error: 'not found' })
      return
    }

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
    `SELECT a.* FROM attachments a
       JOIN applications app ON app.id = a.application_id
      WHERE a.application_id = ? AND app.user_id = ?`,
  )

  router.get('/applications', listHandler(db, attachments))
  router.post('/applications', createHandler(db))
  router.put('/applications/:id', updateHandler(db, attachments))
  router.delete('/applications/:id', deleteHandler(db, uploadsDir, attachments))

  return router
}
