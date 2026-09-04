import { Router } from 'express'
import multer from 'multer'
import type { NextFunction, Request, Response } from 'express'
import type Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { toAttachment, unlinkIfExists } from './applications.ts'
import type { AttachmentRow } from './applications.ts'

function checkApplicationExists(db: Database.Database) {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = Number(req.params.id)
    const exists = db.prepare('SELECT 1 FROM applications WHERE id = ?').get(id)
    if (!exists) {
      res.status(404).json({ error: 'application not found' })
      return
    }
    next()
  }
}

function buildUpload(uploadsDir: string) {
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => {
        mkdirSync(uploadsDir, { recursive: true })
        callback(null, uploadsDir)
      },
      filename: (_req, file, callback) => {
        callback(null, `${randomUUID()}${extname(file.originalname)}`)
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
  })
}

function uploadHandler(db: Database.Database) {
  return (req: Request, res: Response) => {
    const applicationId = Number(req.params.id)
    if (!req.file) {
      res.status(400).json({ error: 'file is required' })
      return
    }

    const result = db
      .prepare(
        `INSERT INTO attachments (application_id, stored_name, original_name, mime_type)
         VALUES (?, ?, ?, ?)`,
      )
      .run(applicationId, req.file.filename, req.file.originalname, req.file.mimetype)

    const row = db
      .prepare('SELECT * FROM attachments WHERE id = ?')
      .get(result.lastInsertRowid) as AttachmentRow
    res.status(201).json(toAttachment(row))
  }
}

function downloadHandler(db: Database.Database, uploadsDir: string) {
  return (req: Request, res: Response) => {
    const id = Number(req.params.id)
    const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as
      | AttachmentRow
      | undefined
    if (!row) {
      res.status(404).json({ error: 'not found' })
      return
    }

    res.download(join(uploadsDir, row.stored_name), row.original_name)
  }
}

function removeHandler(db: Database.Database, uploadsDir: string) {
  return (req: Request, res: Response) => {
    const id = Number(req.params.id)
    const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as
      | AttachmentRow
      | undefined
    if (!row) {
      res.status(404).json({ error: 'not found' })
      return
    }

    unlinkIfExists(join(uploadsDir, row.stored_name))
    db.prepare('DELETE FROM attachments WHERE id = ?').run(id)
    res.status(204).end()
  }
}

export function createAttachmentsRouter(
  db: Database.Database,
  uploadsDir: string,
): Router {
  const router = Router()
  const upload = buildUpload(uploadsDir)

  router.post(
    '/applications/:id/attachments',
    checkApplicationExists(db),
    upload.single('file'),
    uploadHandler(db),
  )
  router.get('/attachments/:id', downloadHandler(db, uploadsDir))
  router.delete('/attachments/:id', removeHandler(db, uploadsDir))

  return router
}
