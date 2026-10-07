import type { NextFunction, Request, Response } from 'express'
import type Database from 'better-sqlite3'
import { readSessionCookie } from '../lib/cookies.ts'
import { HttpError } from '../lib/httpError.ts'

declare global {
  namespace Express {
    interface Request {
      userId: number
    }
  }
}

export function requireSession(db: Database.Database) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = readSessionCookie(req.headers.cookie)
    const session = token
      ? (db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token) as
          | { user_id: number }
          | undefined)
      : undefined

    if (!session) throw new HttpError(401, 'unauthorized')

    req.userId = session.user_id
    next()
  }
}

export function requireAdmin(db: Database.Database) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = db
      .prepare('SELECT role FROM users WHERE id = ?')
      .get(req.userId) as { role: string } | undefined

    if (!user) throw new HttpError(401, 'unauthorized')
    if (user.role !== 'admin') throw new HttpError(403, 'forbidden')

    next()
  }
}
