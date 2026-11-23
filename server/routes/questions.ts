import { Router } from 'express'
import type { Request, Response } from 'express'
import type Database from 'better-sqlite3'
import { join } from 'node:path'
import { fillAnswers, markAnswered, openQuestionIds, questionTexts } from '../lib/askMarkers.ts'
import type { Answers } from '../lib/askMarkers.ts'
import { touchApplication } from '../lib/applications.ts'
import { unlinkIfExists } from '../lib/files.ts'
import { HttpError } from '../lib/httpError.ts'
import { currentDocuments, readTextIfExists, saveMarkdownText } from '../lib/markdownEdits.ts'
import type { MarkdownEdit } from '../lib/markdownEdits.ts'
import type { ApplicationRow } from '../models/application.ts'
import type { OpenQuestion } from '../types.ts'

function findOwnedApplication(db: Database.Database, req: Request): ApplicationRow {
  const row = db
    .prepare('SELECT * FROM applications WHERE id = ? AND user_id = ?')
    .get(Number(req.params.id), req.userId) as ApplicationRow | undefined
  if (!row) throw new HttpError(404, 'application not found')
  return row
}

// A current document whose file is missing is skipped: DB and uploads/ can drift.
function readDocuments(db: Database.Database, uploadsDir: string, applicationId: number): MarkdownEdit[] {
  return currentDocuments(db, applicationId).flatMap((row) => {
    const text = readTextIfExists(uploadsDir, row)
    return text === null ? [] : [{ row, text }]
  })
}

function documentQuestionIds(documents: MarkdownEdit[]): string[] {
  return openQuestionIds(documents.map((document) => document.text).join('\n'))
}

function openQuestions(documents: MarkdownEdit[], notes: string): OpenQuestion[] {
  const texts = questionTexts(notes)
  return documentQuestionIds(documents).map((id) => ({ id, text: texts.get(id) ?? null }))
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return Object.values(value).every((answer) => typeof answer === 'string')
}

/** Trimmed, with blank answers dropped: a blank answer leaves its question open. */
function readAnswers(body: unknown): Answers {
  const { answers } = (body ?? {}) as Record<string, unknown>
  if (!isStringRecord(answers)) throw new HttpError(400, 'answers must be an object of strings')
  const trimmed = Object.entries(answers).map(([id, answer]) => [id, answer.trim()])
  return Object.fromEntries(trimmed.filter(([, answer]) => answer !== ''))
}

interface AnswerRun {
  application: ApplicationRow
  answers: Answers
}

function checkOpen(documents: MarkdownEdit[], answers: Answers): void {
  const open = new Set(documentQuestionIds(documents))
  const closed = Object.keys(answers).find((id) => !open.has(id))
  if (closed) throw new HttpError(409, `${closed} is not an open question`)
}

/** Returns the stored names the saves replaced, to unlink after the commit. */
function applyAnswers(db: Database.Database, uploadsDir: string, { application, answers }: AnswerRun): string[] {
  const documents = readDocuments(db, uploadsDir, application.id)
  checkOpen(documents, answers)
  const replaced: string[] = []
  for (const { row, text } of documents) {
    const filled = fillAnswers(text, answers)
    if (filled === text) continue
    const saved = saveMarkdownText(db, uploadsDir, { row, text: filled })
    if (saved.replacedStoredName) replaced.push(saved.replacedStoredName)
  }
  const notes = markAnswered(application.notes, answers)
  db.prepare('UPDATE applications SET notes = ? WHERE id = ?').run(notes, application.id)
  touchApplication(db, application.id)
  return replaced
}

function questionsHandler(db: Database.Database, uploadsDir: string) {
  return (req: Request, res: Response) => {
    const application = findOwnedApplication(db, req)
    res.json(openQuestions(readDocuments(db, uploadsDir, application.id), application.notes))
  }
}

function answersHandler(db: Database.Database, uploadsDir: string) {
  return (req: Request, res: Response) => {
    const application = findOwnedApplication(db, req)
    const answers = readAnswers(req.body)

    const replaced = db.transaction(() => applyAnswers(db, uploadsDir, { application, answers }))()
    for (const storedName of replaced) unlinkIfExists(join(uploadsDir, storedName))

    const updated = findOwnedApplication(db, req)
    res.json(openQuestions(readDocuments(db, uploadsDir, updated.id), updated.notes))
  }
}

export function createQuestionsRouter(db: Database.Database, uploadsDir: string): Router {
  const router = Router()
  router.get('/applications/:id/questions', questionsHandler(db, uploadsDir))
  router.post('/applications/:id/answers', answersHandler(db, uploadsDir))
  return router
}
