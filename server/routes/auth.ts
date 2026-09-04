import { Router } from 'express'
import type { Request, Response } from 'express'
import type Database from 'better-sqlite3'
import { verifyPassword, createSessionToken } from '../lib/passwords.ts'
import { SESSION_COOKIE, readSessionCookie } from '../lib/cookies.ts'
import { toUser } from '../models/user.ts'
import type { UserRow } from '../models/user.ts'

const COOKIE_OPTIONS = { httpOnly: true, sameSite: 'lax' as const, path: '/' }

function loginHandler(db: Database.Database) {
  return (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>
    const username = typeof body.username === 'string' ? body.username : ''
    const password = typeof body.password === 'string' ? body.password : ''

    const row = db
      .prepare('SELECT * FROM users WHERE username = ?')
      .get(username) as UserRow | undefined

    if (!row || !verifyPassword(password, row.password_hash)) {
      res.status(401).json({ error: 'invalid credentials' })
      return
    }

    const token = createSessionToken()
    db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, row.id)

    res.cookie(SESSION_COOKIE, token, COOKIE_OPTIONS)
    res.json(toUser(row))
  }
}

function logoutHandler(db: Database.Database) {
  return (req: Request, res: Response) => {
    const token = readSessionCookie(req.headers.cookie)
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
    res.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS)
    res.status(204).end()
  }
}

function meHandler(db: Database.Database) {
  return (req: Request, res: Response) => {
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

    const row = db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(session.user_id) as UserRow
    res.json(toUser(row))
  }
}

export function createAuthRouter(db: Database.Database): Router {
  const router = Router()
  router.post('/login', loginHandler(db))
  router.post('/logout', logoutHandler(db))
  router.get('/me', meHandler(db))
  return router
}
