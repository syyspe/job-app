import type { NextFunction, Request, Response } from 'express'
import type Database from 'better-sqlite3'
import { readSessionCookie } from '../lib/cookies.ts'

declare global {
  namespace Express {
    interface Request {
      userId: number
    }
  }
}

export function requireSession(db: Database.Database) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = readSessionCookie(req.headers.cookie)
    const session = token
      ? (db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token) as
          | { user_id: number }
          | undefined)
      : undefined

    if (!session) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }

    req.userId = session.user_id
    next()
  }
}
