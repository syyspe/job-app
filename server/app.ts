import express from 'express'
import type { Application as ExpressApp } from 'express'
import type Database from 'better-sqlite3'
import { createApplicationsRouter } from './applications.ts'
import { createAttachmentsRouter } from './attachments.ts'

export function createApp(db: Database.Database, dataDir: string): ExpressApp {
  const app = express()
  app.use(express.json())
  app.use('/api', createApplicationsRouter(db, dataDir))
  app.use('/api', createAttachmentsRouter(db, dataDir))
  return app
}
