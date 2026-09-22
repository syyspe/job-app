import express from 'express'
import type { Application as ExpressApp } from 'express'
import type Database from 'better-sqlite3'
import { join } from 'node:path'
import { createApplicationsRouter } from './routes/applications.ts'
import { createAttachmentsRouter } from './routes/attachments.ts'
import { createAuthRouter } from './routes/auth.ts'
import { createConfigRouter } from './routes/config.ts'
import { createUsersRouter } from './routes/users.ts'
import { requireAdmin, requireSession } from './middleware/auth.ts'
import { jsonErrorHandler } from './middleware/errors.ts'
import { DEFAULT_PAGE_SIZE } from './lib/config.ts'

type CreateAppOptions = { staticDir?: string; pageSize?: number }

export function createApp(
  db: Database.Database,
  uploadsDir: string,
  { staticDir, pageSize = DEFAULT_PAGE_SIZE }: CreateAppOptions = {},
): ExpressApp {
  const app = express()
  app.use(express.json())
  app.use('/api', createAuthRouter(db))
  app.use('/api', requireSession(db))
  app.use('/api', createConfigRouter(pageSize))
  app.use('/api', createApplicationsRouter(db, uploadsDir))
  app.use('/api', createAttachmentsRouter(db, uploadsDir))
  app.use('/api/users', requireAdmin(db))
  app.use('/api', createUsersRouter(db, uploadsDir))
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
