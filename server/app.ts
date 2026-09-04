import express from 'express'
import type { Application as ExpressApp } from 'express'
import type Database from 'better-sqlite3'
import { join } from 'node:path'
import { createApplicationsRouter } from './routes/applications.ts'
import { createAttachmentsRouter } from './routes/attachments.ts'
import { jsonErrorHandler } from './middleware/errors.ts'

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
