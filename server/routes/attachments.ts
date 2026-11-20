import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import type Database from 'better-sqlite3'
import { join } from 'node:path'
import { toAttachment } from '../models/attachment.ts'
import { unlinkIfExists } from '../lib/files.ts'
import { insertAttachment, touchApplication } from '../lib/applications.ts'
import { createUpload } from '../lib/uploads.ts'
import { HttpError } from '../lib/httpError.ts'
import type { AttachmentRow } from '../models/attachment.ts'

function checkApplicationExists(db: Database.Database) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const id = Number(req.params.id)
    const exists = db
      .prepare('SELECT 1 FROM applications WHERE id = ? AND user_id = ?')
      .get(id, req.userId)
    if (!exists) throw new HttpError(404, 'application not found')
    next()
  }
}

function uploadHandler(db: Database.Database) {
  return (req: Request, res: Response) => {
    const applicationId = Number(req.params.id)
    if (!req.file) throw new HttpError(400, 'file is required')

    const row = insertAttachment(db, applicationId, req.file)
    touchApplication(db, applicationId)
    res.status(201).json(toAttachment(row))
  }
}

function findOwnedAttachment(db: Database.Database, id: number, userId: number) {
  return db
    .prepare(
      `SELECT a.* FROM attachments a
         JOIN applications app ON app.id = a.application_id
        WHERE a.id = ? AND app.user_id = ?`,
    )
    .get(id, userId) as AttachmentRow | undefined
}

function downloadHandler(db: Database.Database, uploadsDir: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = Number(req.params.id)
    const row = findOwnedAttachment(db, id, req.userId)
    if (!row) throw new HttpError(404, 'not found')

    // The send error carries a 404 and the absolute path; neither is the caller's to see.
    res.download(join(uploadsDir, row.stored_name), row.original_name, (error) => {
      if (!error) return
      next(new Error(`cannot send attachment ${row.id} (${row.stored_name})`, { cause: error }))
    })
  }
}

function checkAttachmentOwned(db: Database.Database) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!findOwnedAttachment(db, Number(req.params.id), req.userId)) {
      throw new HttpError(404, 'not found')
    }
    next()
  }
}

function replaceHandler(db: Database.Database, uploadsDir: string) {
  return (req: Request, res: Response) => {
    const id = Number(req.params.id)
    if (!req.file) throw new HttpError(400, 'file is required')

    const old = findOwnedAttachment(db, id, req.userId) as AttachmentRow
    db.prepare(
      `UPDATE attachments
          SET stored_name = ?, original_name = ?, mime_type = ?, uploaded_at = datetime('now')
        WHERE id = ?`,
    ).run(req.file.filename, req.file.originalname, req.file.mimetype, id)
    unlinkIfExists(join(uploadsDir, old.stored_name))
    touchApplication(db, old.application_id)

    const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as AttachmentRow
    res.json(toAttachment(row))
  }
}

function removeHandler(db: Database.Database, uploadsDir: string) {
  return (req: Request, res: Response) => {
    const id = Number(req.params.id)
    const row = findOwnedAttachment(db, id, req.userId)
    if (!row) throw new HttpError(404, 'not found')

    unlinkIfExists(join(uploadsDir, row.stored_name))
    db.prepare(
      `DELETE FROM attachments
        WHERE id = ? AND application_id IN (SELECT id FROM applications WHERE user_id = ?)`,
    ).run(id, req.userId)
    touchApplication(db, row.application_id)
    res.status(204).end()
  }
}

function pendingSyncHandler(db: Database.Database) {
  return (req: Request, res: Response) => {
    const rows = db
      .prepare(
        `SELECT a.* FROM attachments a
           JOIN applications app ON app.id = a.application_id
          WHERE a.profile_sync = 1 AND app.user_id = ?
          ORDER BY a.id`,
      )
      .all(req.userId) as AttachmentRow[]
    res.json(rows.map(toAttachment))
  }
}

function readProfileSyncBody(body: unknown): { pending: boolean; storedName?: string } {
  const { pending, storedName } = (body ?? {}) as Record<string, unknown>
  if (typeof pending !== 'boolean') throw new HttpError(400, 'pending must be true or false')
  if (storedName !== undefined && typeof storedName !== 'string') {
    throw new HttpError(400, 'storedName must be a string')
  }
  return { pending, storedName }
}

function profileSyncHandler(db: Database.Database) {
  return (req: Request, res: Response) => {
    const id = Number(req.params.id)
    const current = findOwnedAttachment(db, id, req.userId)
    if (!current) throw new HttpError(404, 'not found')
    const { pending, storedName } = readProfileSyncBody(req.body)
    // The runner clears a mark only for the bytes it copied; a replace since then keeps it.
    if (!pending && storedName !== undefined && storedName !== current.stored_name) {
      throw new HttpError(409, 'attachment changed since it was listed')
    }

    db.prepare('UPDATE attachments SET profile_sync = ? WHERE id = ?').run(pending ? 1 : 0, id)
    const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as AttachmentRow
    res.json(toAttachment(row))
  }
}

export function createAttachmentsRouter(
  db: Database.Database,
  uploadsDir: string,
): Router {
  const router = Router()
  const upload = createUpload(uploadsDir)

  router.post(
    '/applications/:id/attachments',
    checkApplicationExists(db),
    upload.single('file'),
    uploadHandler(db),
  )
  router.get('/attachments/pending-sync', pendingSyncHandler(db))
  router.get('/attachments/:id', downloadHandler(db, uploadsDir))
  router.put(
    '/attachments/:id',
    checkAttachmentOwned(db),
    upload.single('file'),
    replaceHandler(db, uploadsDir),
  )
  router.put('/attachments/:id/profile-sync', profileSyncHandler(db))
  router.delete('/attachments/:id', removeHandler(db, uploadsDir))

  return router
}
