import express from 'express'
import type { Application as ExpressApp } from 'express'
import type Database from 'better-sqlite3'
import { join } from 'node:path'
import { createAdsRouter } from './routes/ads.ts'
import { createAgentRunsRouter } from './routes/agentRuns.ts'
import { createApplicationsRouter } from './routes/applications.ts'
import { createAttachmentsRouter } from './routes/attachments.ts'
import { createAuthRouter } from './routes/auth.ts'
import { createConfigRouter } from './routes/config.ts'
import { createQuestionsRouter } from './routes/questions.ts'
import { createUsersRouter } from './routes/users.ts'
import { requireAdmin, requireAgentAccess, requireSession } from './middleware/auth.ts'
import { requireParsableBody } from './middleware/contentType.ts'
import { jsonErrorHandler } from './middleware/errors.ts'
import { requestLogging } from './middleware/requestLogging.ts'
import type { RunnerSpawner } from './lib/agentRunner.ts'
import { DEFAULT_PAGE_SIZE } from './lib/config.ts'
import { createLogger } from './lib/logger.ts'
import type { Logger } from './lib/logger.ts'

type CreateAppOptions = {
  staticDir?: string
  pageSize?: number
  logger?: Logger
  secureCookies?: boolean
  // Without one the app has no run routes.
  runner?: RunnerSpawner
}

// Runs spawn the runner with its credentials and spend, so only users an admin
// has granted agent access may start or list them — whatever their role.
function mountAgentRuns(app: ExpressApp, db: Database.Database, runner: RunnerSpawner | undefined): void {
  if (!runner) return
  app.use('/api/agent', requireAgentAccess(db))
  app.use('/api', createAgentRunsRouter(db, runner))
}

export function createApp(
  db: Database.Database,
  uploadsDir: string,
  {
    staticDir,
    pageSize = DEFAULT_PAGE_SIZE,
    logger = createLogger('silent'),
    secureCookies = false,
    runner,
  }: CreateAppOptions = {},
): ExpressApp {
  const app = express()
  app.use(requestLogging(logger))
  app.use(express.json())
  app.use('/api', requireParsableBody)
  app.use('/api', createAuthRouter(db, secureCookies))
  app.use('/api', requireSession(db))
  app.use('/api', createConfigRouter(pageSize))
  app.use('/api', createApplicationsRouter(db, uploadsDir))
  app.use('/api', createAttachmentsRouter(db, uploadsDir))
  app.use('/api', createQuestionsRouter(db, uploadsDir))
  app.use('/api', createAdsRouter(db, uploadsDir))
  mountAgentRuns(app, db, runner)
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
