import { Router } from 'express'
import type { Request, Response } from 'express'
import type Database from 'better-sqlite3'
import { toAd, toAdSummary } from '../models/ad.ts'
import {
  handOverAd,
  ingestAd,
  listAds,
  markReported,
  requireAd,
  transitionAd,
} from '../lib/ads.ts'
import {
  parseAdHandover,
  parseAdIngest,
  parseAdTransition,
  parseReportedIds,
  parseStateFilter,
} from '../lib/adValidation.ts'

function listHandler(db: Database.Database) {
  return (req: Request, res: Response) => {
    const state = parseStateFilter(req.query.state)
    res.json(listAds(db, req.userId, state).map(toAdSummary))
  }
}

function getHandler(db: Database.Database) {
  return (req: Request, res: Response) => {
    res.json(toAd(requireAd(db, Number(req.params.id), req.userId)))
  }
}

function ingestHandler(db: Database.Database) {
  return (req: Request, res: Response) => {
    const ingest = parseAdIngest(req.body)
    const { ad, created } = db.transaction(() => ingestAd(db, req.userId, ingest))()
    res.status(created ? 201 : 200).json(toAd(ad))
  }
}

function transitionHandler(db: Database.Database) {
  return (req: Request, res: Response) => {
    const transition = parseAdTransition(req.body)
    const moved = db.transaction(() => {
      const ad = requireAd(db, Number(req.params.id), req.userId)
      return transitionAd(db, ad, transition)
    })()
    res.json(toAd(moved))
  }
}

function handoverHandler(db: Database.Database) {
  return (req: Request, res: Response) => {
    const handover = parseAdHandover(req.body)
    const moved = db.transaction(() => {
      const ad = requireAd(db, Number(req.params.id), req.userId)
      return handOverAd(db, ad, handover)
    })()
    res.json(toAd(moved))
  }
}

function reportedHandler(db: Database.Database) {
  return (req: Request, res: Response) => {
    const ids = parseReportedIds(req.body)
    db.transaction(() => markReported(db, req.userId, ids))()
    res.status(204).end()
  }
}

export function createAdsRouter(db: Database.Database): Router {
  const router = Router()

  router.get('/ads', listHandler(db))
  router.post('/ads', ingestHandler(db))
  router.post('/ads/reported', reportedHandler(db))
  router.get('/ads/:id', getHandler(db))
  router.post('/ads/:id/transition', transitionHandler(db))
  router.post('/ads/:id/handover', handoverHandler(db))

  return router
}
