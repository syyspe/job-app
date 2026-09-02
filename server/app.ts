import express from 'express'
import type {
  Application as ExpressApp,
  NextFunction,
  Request,
  Response,
} from 'express'
import multer from 'multer'
import type Database from 'better-sqlite3'
import { createApplicationsRouter } from './applications.ts'
import { createAttachmentsRouter } from './attachments.ts'

function jsonErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  const status = err instanceof multer.MulterError ? 400 : 500
  const message = err instanceof Error ? err.message : 'unexpected error'
  res.status(status).json({ error: message })
}

export function createApp(db: Database.Database, dataDir: string): ExpressApp {
  const app = express()
  app.use(express.json())
  app.use('/api', createApplicationsRouter(db, dataDir))
  app.use('/api', createAttachmentsRouter(db, dataDir))
  app.use(jsonErrorHandler)
  return app
}
