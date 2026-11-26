import { Router } from 'express'
import type { Request, Response } from 'express'
import type Database from 'better-sqlite3'
import type { RunnerSpawner } from '../lib/agentRunner.ts'
import { currentRun, recentRuns, startRun } from '../lib/agentRuns.ts'
import { HttpError } from '../lib/httpError.ts'
import { validateRunKind } from '../lib/validation.ts'

function listHandler(db: Database.Database) {
  return (_req: Request, res: Response) => {
    res.json({ current: currentRun(db), recent: recentRuns(db) })
  }
}

// The check and the insert are synchronous, so two requests can't both pass.
function startHandler(db: Database.Database, runner: RunnerSpawner) {
  return (req: Request, res: Response) => {
    const kind = validateRunKind(req.body)
    if (currentRun(db)) throw new HttpError(409, 'a run is already in progress')

    const run = startRun(db, { kind, userId: req.userId, runner, log: res.locals.log })
    res.status(201).json(run)
  }
}

export function createAgentRunsRouter(db: Database.Database, runner: RunnerSpawner): Router {
  const router = Router()
  router.get('/agent/runs', listHandler(db))
  router.post('/agent/runs', startHandler(db, runner))
  return router
}
