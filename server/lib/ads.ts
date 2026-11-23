import type Database from 'better-sqlite3'
import type { AdRow } from '../models/ad.ts'
import type { ApplicationRow } from '../models/application.ts'
import type { AttachmentRow } from '../models/attachment.ts'
import type { AdEvaluation, AdPrescreen, AdState } from '../types.ts'
import { findTitleDuplicate, findUrlDuplicate } from './adDedup.ts'
import {
  blanksOnceReported,
  blanksOnEntry,
  canTransition,
  clearsBody,
  recordsAttempts,
  retryTarget,
} from './adStates.ts'
import type { AdHandover, AdIngest, AdTransition } from './adValidation.ts'
import { insertApplication, insertAttachment } from './applications.ts'
import { HttpError } from './httpError.ts'
import type { ApplicationInput } from './validation.ts'

const MAX_ATTEMPTS = 3

interface AdMove {
  to: AdState
  body?: string
  evaluation?: AdEvaluation
  lastError?: string
  duplicateOf?: number | null
  applicationId?: number
}

export interface AdDraft {
  input: ApplicationInput
  files: Express.Multer.File[]
}

export interface DraftedAd {
  ad: AdRow
  application: ApplicationRow
  attachments: AttachmentRow[]
}

function readAd(db: Database.Database, id: number): AdRow {
  return db.prepare('SELECT * FROM ads WHERE id = ?').get(id) as AdRow
}

export function requireAd(db: Database.Database, id: number, userId: number): AdRow {
  const row = db.prepare('SELECT * FROM ads WHERE id = ? AND user_id = ?').get(id, userId) as
    | AdRow
    | undefined
  if (!row) throw new HttpError(404, 'not found')
  return row
}

export function listAds(db: Database.Database, userId: number, state?: AdState): AdRow[] {
  const filter = state ?? null
  return db
    .prepare(
      `SELECT * FROM ads
        WHERE user_id = ? AND (? IS NULL OR state = ?)
        ORDER BY first_seen_at DESC, id DESC`,
    )
    .all(userId, filter, filter) as AdRow[]
}

// The reason talks about the ad; the verdict stays for the verdict-vs-click
// comparison.
function blankedPrescreen(prescreen: string | null): string | null {
  if (prescreen === null) return null
  const { verdict } = JSON.parse(prescreen) as AdPrescreen
  return JSON.stringify({ verdict, reason: '' })
}

// What a hand-over ad keeps once blanked: only the keys deduplication needs.
function blanked(ad: AdRow): AdRow {
  return { ...ad, title: '', company: '', prescreen: blankedPrescreen(ad.prescreen) }
}

function movedRow(ad: AdRow, move: AdMove): AdRow {
  const blank = ad.source_mode === 'handover' && blanksOnEntry(move.to)
  return {
    ...(blank ? blanked(ad) : ad),
    state: move.to,
    body: clearsBody(move.to) ? null : (move.body ?? ad.body),
    evaluation: move.evaluation ? JSON.stringify(move.evaluation) : ad.evaluation,
    last_error: move.lastError ?? ad.last_error,
    duplicate_of: move.duplicateOf ?? ad.duplicate_of,
    application_id: move.applicationId ?? ad.application_id,
  }
}

function saveMove(db: Database.Database, row: AdRow): AdRow {
  db.prepare(
    `UPDATE ads
        SET url = ?, canonical_url = ?, title = ?, company = ?, deadline = ?, state = ?, body = ?,
            evaluation = ?, prescreen = ?, application_id = ?, duplicate_of = ?, attempts = ?,
            last_error = ?, updated_at = datetime('now'), reported_at = NULL
      WHERE id = ?`,
  ).run(
    row.url,
    row.canonical_url,
    row.title,
    row.company,
    row.deadline,
    row.state,
    row.body,
    row.evaluation,
    row.prescreen,
    row.application_id,
    row.duplicate_of,
    row.attempts,
    row.last_error,
    row.id,
  )
  return readAd(db, row.id)
}

function insertAd(db: Database.Database, userId: number, ingest: AdIngest): AdRow {
  const result = db
    .prepare(
      `INSERT INTO ads
         (user_id, source, source_mode, external_id, url, canonical_url,
          title, company, location, deadline, state)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
    )
    .run(
      userId,
      ingest.source,
      ingest.sourceMode,
      ingest.externalId,
      ingest.url,
      ingest.canonicalUrl,
      ingest.title,
      ingest.company,
      ingest.location,
      ingest.deadline,
    )
  return readAd(db, Number(result.lastInsertRowid))
}

export function ingestAd(
  db: Database.Database,
  userId: number,
  ingest: AdIngest,
): { ad: AdRow; created: boolean } {
  const existing = db
    .prepare('SELECT * FROM ads WHERE user_id = ? AND source = ? AND external_id = ?')
    .get(userId, ingest.source, ingest.externalId) as AdRow | undefined
  if (existing) return { ad: existing, created: false }

  const inserted = insertAd(db, userId, ingest)
  const match = findUrlDuplicate(db, inserted)
  if (!match) return { ad: inserted, created: true }
  const duplicate = movedRow(inserted, { to: 'duplicate', duplicateOf: match.duplicateOf })
  return { ad: saveMove(db, duplicate), created: true }
}

function enterReady(db: Database.Database, ad: AdRow, body: string): AdRow {
  const ready = movedRow(ad, { to: 'ready', body })
  const match = findUrlDuplicate(db, ready) ?? findTitleDuplicate(db, ready)
  if (!match) return saveMove(db, ready)
  return saveMove(db, movedRow(ready, { to: 'duplicate', duplicateOf: match.duplicateOf }))
}

function recordAttempt(db: Database.Database, ad: AdRow, error: string | undefined): AdRow {
  if (!error || !recordsAttempts(ad.state)) {
    throw new HttpError(409, `ad is already ${ad.state}`)
  }
  const counted = { ...ad, attempts: ad.attempts + 1, last_error: error }
  if (counted.attempts >= MAX_ATTEMPTS) return saveMove(db, movedRow(counted, { to: 'failed' }))

  db.prepare(
    `UPDATE ads SET attempts = ?, last_error = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(counted.attempts, error, ad.id)
  return readAd(db, ad.id)
}

function retryAd(db: Database.Database, ad: AdRow, to: AdState): AdRow {
  if (to !== retryTarget(ad.source_mode)) {
    throw new HttpError(409, `a ${ad.source_mode} ad retries to ${retryTarget(ad.source_mode)}`)
  }
  const reset = { ...movedRow(ad, { to }), attempts: 0, last_error: null, evaluation: null }
  return saveMove(db, reset)
}

// Before the dedup rules run, so a company only the page names feeds rule 3.
function withPageFields(ad: AdRow, { company, deadline }: AdTransition): AdRow {
  return { ...ad, company: ad.company || (company ?? ''), deadline: ad.deadline || (deadline ?? '') }
}

function readyBody(transition: AdTransition): string {
  if (!transition.body?.trim()) throw new HttpError(400, 'body is required to enter ready')
  return transition.body
}

function plainMove({ to, evaluation, error }: AdTransition): AdMove {
  if ((to === 'suitable' || to === 'unsuitable') && !evaluation) {
    throw new HttpError(400, `evaluation is required when to is ${to}`)
  }
  return { to, evaluation, lastError: to === 'failed' ? error : undefined }
}

export function transitionAd(
  db: Database.Database,
  ad: AdRow,
  transition: AdTransition,
): AdRow {
  const { to } = transition
  if (to === ad.state) return recordAttempt(db, ad, transition.error)
  if (!canTransition(ad.state, to)) {
    throw new HttpError(409, `an ad cannot move from ${ad.state} to ${to}`)
  }
  if (ad.state === 'failed' && to !== 'dismissed') return retryAd(db, ad, to)
  if (to === 'ready') return enterReady(db, withPageFields(ad, transition), readyBody(transition))
  return saveMove(db, movedRow(ad, plainMove(transition)))
}

export function handOverAd(db: Database.Database, ad: AdRow, handover: AdHandover): AdRow {
  if (!canTransition(ad.state, 'ready')) {
    throw new HttpError(409, `an ad cannot be handed over from ${ad.state}`)
  }
  const updated = {
    ...ad,
    url: handover.url ?? ad.url,
    canonical_url: handover.canonicalUrl ?? ad.canonical_url,
    title: handover.title ?? ad.title,
    company: handover.company ?? ad.company,
  }
  return enterReady(db, updated, handover.text)
}

function requireWaiting(ad: AdRow, action: string): void {
  if (ad.state !== 'awaiting_handover') {
    throw new HttpError(409, `an ad cannot be ${action} from ${ad.state}`)
  }
}

// A repeat keeps the first click's time: it is the record the pre-screen
// verdict is compared against.
export function requestFetch(db: Database.Database, ad: AdRow): AdRow {
  requireWaiting(ad, 'fetched')
  if (ad.source_mode !== 'handover') throw new HttpError(409, 'only a hand-over ad can be fetched')
  db.prepare(
    `UPDATE ads SET fetch_requested_at = COALESCE(fetch_requested_at, datetime('now')),
            updated_at = datetime('now')
      WHERE id = ?`,
  ).run(ad.id)
  return readAd(db, ad.id)
}

export function setPrescreen(db: Database.Database, ad: AdRow, prescreen: AdPrescreen): AdRow {
  requireWaiting(ad, 'pre-screened')
  db.prepare(`UPDATE ads SET prescreen = ?, updated_at = datetime('now') WHERE id = ?`).run(
    JSON.stringify(prescreen),
    ad.id,
  )
  return readAd(db, ad.id)
}

// The caller runs this in a transaction, so a failure leaves no application behind.
export function draftAd(db: Database.Database, ad: AdRow, draft: AdDraft): DraftedAd {
  if (ad.state !== 'suitable') throw new HttpError(409, `an ad cannot be drafted from ${ad.state}`)
  const application = insertApplication(db, ad.user_id, draft.input)
  const attachments = draft.files.map((file) => insertAttachment(db, application.id, file))
  const moved = saveMove(db, movedRow(ad, { to: 'drafted', applicationId: application.id }))
  return { ad: moved, application, attachments }
}

function markOneReported(db: Database.Database, ad: AdRow): void {
  const kept = ad.source_mode === 'handover' && blanksOnceReported(ad.state) ? blanked(ad) : ad
  db.prepare(
    `UPDATE ads SET reported_at = datetime('now'), title = ?, company = ?, prescreen = ? WHERE id = ?`,
  ).run(kept.title, kept.company, kept.prescreen, ad.id)
}

/** Ids the user does not own are skipped. */
export function markReported(db: Database.Database, userId: number, ids: number[]): void {
  const owned = db.prepare('SELECT * FROM ads WHERE id = ? AND user_id = ?')
  for (const id of ids) {
    const ad = owned.get(id, userId) as AdRow | undefined
    if (ad) markOneReported(db, ad)
  }
}
