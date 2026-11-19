import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import type Database from 'better-sqlite3'
import { join } from 'node:path'
import { toAd, toAdSummary } from '../models/ad.ts'
import { toApplication } from '../models/application.ts'
import {
  draftAd,
  handOverAd,
  ingestAd,
  listAds,
  markReported,
  requireAd,
  transitionAd,
} from '../lib/ads.ts'
import {
  parseAdDraft,
  parseAdHandover,
  parseAdIngest,
  parseAdTransition,
  parseReportedIds,
  parseStateFilter,
} from '../lib/adValidation.ts'
import { unlinkIfExists } from '../lib/files.ts'
import { HttpError } from '../lib/httpError.ts'
import { createUpload } from '../lib/uploads.ts'

const DRAFT_FILES = ['coverLetter', 'cv', 'ad'] as const

type UploadedFiles = Record<string, Express.Multer.File[]> | undefined

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

// Answers 404 before multer writes anything to disk.
function checkAdOwned(db: Database.Database) {
  return (req: Request, _res: Response, next: NextFunction) => {
    requireAd(db, Number(req.params.id), req.userId)
    next()
  }
}

function draftFiles(req: Request): Express.Multer.File[] {
  const uploaded = req.files as UploadedFiles
  const files = DRAFT_FILES.map((name) => uploaded?.[name]?.[0])
  if (files.includes(undefined)) {
    throw new HttpError(400, 'coverLetter, cv and ad files are required')
  }
  return files as Express.Multer.File[]
}

function createDraft(db: Database.Database, req: Request) {
  const files = draftFiles(req)
  const input = parseAdDraft(req.body)
  return db.transaction(() => {
    const ad = requireAd(db, Number(req.params.id), req.userId)
    return draftAd(db, ad, { input, files })
  })()
}

// A rejected draft leaves no file behind, whatever was uploaded.
function draftHandler(db: Database.Database, uploadsDir: string) {
  return (req: Request, res: Response) => {
    try {
      const { ad, application, attachments } = createDraft(db, req)
      res.status(201).json({ ad: toAd(ad), application: toApplication(application, attachments) })
    } catch (err) {
      const uploaded = Object.values((req.files as UploadedFiles) ?? {}).flat()
      for (const file of uploaded) unlinkIfExists(join(uploadsDir, file.filename))
      throw err
    }
  }
}

export function createAdsRouter(db: Database.Database, uploadsDir: string): Router {
  const router = Router()
  const upload = createUpload(uploadsDir)
  const draftUpload = upload.fields(DRAFT_FILES.map((name) => ({ name, maxCount: 1 })))

  router.get('/ads', listHandler(db))
  router.post('/ads', ingestHandler(db))
  router.post('/ads/reported', reportedHandler(db))
  router.get('/ads/:id', getHandler(db))
  router.post('/ads/:id/transition', transitionHandler(db))
  router.post('/ads/:id/handover', handoverHandler(db))
  router.post('/ads/:id/draft', checkAdOwned(db), draftUpload, draftHandler(db, uploadsDir))

  return router
}
