import { Router } from 'express'
import type { Request, Response } from 'express'
import type Database from 'better-sqlite3'
import { verifyPassword, createSessionToken } from '../lib/passwords.ts'
import { SESSION_COOKIE, readSessionCookie } from '../lib/cookies.ts'
import { toUser } from '../models/user.ts'
import type { UserRow } from '../models/user.ts'
import { HttpError } from '../lib/httpError.ts'

type CookieOptions = { httpOnly: true; sameSite: 'lax'; path: '/'; secure: boolean }

function loginHandler(db: Database.Database, cookieOptions: CookieOptions) {
  return (req: Request, res: Response) => {
    // Express 5 leaves req.body undefined when no parser matched the request.
    const body = (req.body ?? {}) as Record<string, unknown>
    const username = typeof body.username === 'string' ? body.username : ''
    const password = typeof body.password === 'string' ? body.password : ''

    const row = db
      .prepare('SELECT * FROM users WHERE username = ?')
      .get(username) as UserRow | undefined

    if (!row || !verifyPassword(password, row.password_hash)) {
      throw new HttpError(401, 'invalid credentials')
    }

    const token = createSessionToken()
    db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, row.id)

    res.cookie(SESSION_COOKIE, token, cookieOptions)
    res.json(toUser(row))
  }
}

function logoutHandler(db: Database.Database, cookieOptions: CookieOptions) {
  return (req: Request, res: Response) => {
    const token = readSessionCookie(req.headers.cookie)
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
    res.clearCookie(SESSION_COOKIE, cookieOptions)
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

    if (!session) throw new HttpError(401, 'unauthorized')

    const row = db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(session.user_id) as UserRow | undefined

    if (!row) throw new HttpError(401, 'unauthorized')

    res.json(toUser(row))
  }
}

export function createAuthRouter(db: Database.Database, secureCookies: boolean): Router {
  const cookieOptions: CookieOptions = { httpOnly: true, sameSite: 'lax', path: '/', secure: secureCookies }
  const router = Router()
  router.post('/login', loginHandler(db, cookieOptions))
  router.post('/logout', logoutHandler(db, cookieOptions))
  router.get('/me', meHandler(db))
  return router
}
