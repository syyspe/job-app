import { Router } from 'express'
import multer from 'multer'
import type Database from 'better-sqlite3'
import { mkdirSync, unlinkSync } from 'node:fs'
import { extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Attachment } from './types.ts'

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

export function createAttachmentsRouter(
  db: Database.Database,
  dataDir: string,
): Router {
  const router = Router()
  const uploadsDir = join(dataDir, 'uploads')

  const upload = multer({
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

  router.post(
    '/applications/:id/attachments',
    upload.single('file'),
    (req, res) => {
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
        .run(
          applicationId,
          req.file.filename,
          req.file.originalname,
          req.file.mimetype,
        )

      const row = db
        .prepare('SELECT * FROM attachments WHERE id = ?')
        .get(result.lastInsertRowid) as AttachmentRow
      res.status(201).json(toAttachment(row))
    },
  )

  router.get('/attachments/:id', (req, res) => {
    const id = Number(req.params.id)
    const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as
      | AttachmentRow
      | undefined
    if (!row) {
      res.status(404).json({ error: 'not found' })
      return
    }

    res.download(join(uploadsDir, row.stored_name), row.original_name)
  })

  router.delete('/attachments/:id', (req, res) => {
    const id = Number(req.params.id)
    const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as
      | AttachmentRow
      | undefined
    if (!row) {
      res.status(404).json({ error: 'not found' })
      return
    }

    db.prepare('DELETE FROM attachments WHERE id = ?').run(id)
    unlinkSync(join(uploadsDir, row.stored_name))
    res.status(204).end()
  })

  return router
}
