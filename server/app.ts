import express from 'express'
import type {
  Application as ExpressApp,
  NextFunction,
  Request,
  Response,
} from 'express'
import multer from 'multer'
import type Database from 'better-sqlite3'
import { join } from 'node:path'
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

type CreateAppOptions = { staticDir?: string }

export function createApp(
  db: Database.Database,
  uploadsDir: string,
  { staticDir }: CreateAppOptions = {},
): ExpressApp {
  const app = express()
  app.use(express.json())
  app.use('/api', createApplicationsRouter(db, uploadsDir))
  app.use('/api', createAttachmentsRouter(db, uploadsDir))
  if (staticDir) {
    app.use(express.static(staticDir))
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) {
        next()
        return
      }
      res.sendFile(join(staticDir, 'index.html'))
    })
  }
  app.use(jsonErrorHandler)
  return app
}
