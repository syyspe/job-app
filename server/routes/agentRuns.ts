import { Router } from 'express'
import type { Request, Response } from 'express'
import type Database from 'better-sqlite3'
import type { RunnerSpawner } from '../lib/agentRunner.ts'
import { requireAd } from '../lib/ads.ts'
import { currentRun, recentRuns, startRun } from '../lib/agentRuns.ts'
import { HttpError } from '../lib/httpError.ts'
import { validateRunRequest } from '../lib/validation.ts'
import type { RunRequest } from '../types.ts'

function listHandler(db: Database.Database) {
  return (_req: Request, res: Response) => {
    res.json({ current: currentRun(db), recent: recentRuns(db) })
  }
}

function checkDraftable(db: Database.Database, request: RunRequest, userId: number): void {
  if (request.kind !== 'draft') return
  const ad = requireAd(db, request.adId, userId)
  if (ad.state !== 'suitable') throw new HttpError(409, 'ad is not suitable')
}

// The checks and the insert are synchronous, so two requests can't both pass.
function startHandler(db: Database.Database, runner: RunnerSpawner) {
  return (req: Request, res: Response) => {
    const request = validateRunRequest(req.body)
    if (currentRun(db)) throw new HttpError(409, 'a run is already in progress')
    checkDraftable(db, request, req.userId)

    const run = startRun(db, { request, userId: req.userId, runner, log: res.locals.log })
    res.status(201).json(run)
  }
}

export function createAgentRunsRouter(db: Database.Database, runner: RunnerSpawner): Router {
  const router = Router()
  router.get('/agent/runs', listHandler(db))
  router.post('/agent/runs', startHandler(db, runner))
  return router
}
