import { Router } from 'express'
import type { Request, Response } from 'express'
import type Database from 'better-sqlite3'
import { join } from 'node:path'
import { toUser } from '../models/user.ts'
import type { UserRow } from '../models/user.ts'
import { validatePassword, validateRole, validateUserInput } from '../lib/validation.ts'
import { HttpError } from '../lib/httpError.ts'
import { unlinkIfExists } from '../lib/files.ts'
import { hashPassword } from '../lib/passwords.ts'
import { createUser } from '../lib/seed.ts'
import { adminCount, setUserRole } from '../lib/users.ts'

type StoredNamesForUser = Database.Statement<[number], { stored_name: string }>

function findUser(db: Database.Database, id: number): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
}

function listHandler(db: Database.Database) {
  return (_req: Request, res: Response) => {
    const rows = db.prepare('SELECT * FROM users ORDER BY id').all() as UserRow[]
    res.json(rows.map(toUser))
  }
}

function createHandler(db: Database.Database) {
  return (req: Request, res: Response) => {
    const input = validateUserInput(req.body)
    const taken = db.prepare('SELECT 1 FROM users WHERE username = ?').get(input.username)
    if (taken) throw new HttpError(409, 'username taken')

    const id = createUser(db, input.username, input.password)
    setUserRole(db, id, input.role)
    res.status(201).json(toUser(findUser(db, id) as UserRow))
  }
}

function roleHandler(db: Database.Database) {
  return (req: Request, res: Response) => {
    const id = Number(req.params.id)
    const role = validateRole(req.body)
    const existing = findUser(db, id)
    if (!existing) throw new HttpError(404, 'not found')

    if (role !== 'admin' && existing.role === 'admin' && adminCount(db) === 1) {
      throw new HttpError(409, 'cannot demote the last admin')
    }

    // The sole-admin case above is the same person, and reports itself better.
    if (role !== 'admin' && id === req.userId) {
      throw new HttpError(400, 'cannot demote yourself')
    }

    setUserRole(db, id, role)
    res.json(toUser(findUser(db, id) as UserRow))
  }
}

function passwordHandler(db: Database.Database) {
  return (req: Request, res: Response) => {
    const id = Number(req.params.id)
    const password = validatePassword(req.body)
    const existing = findUser(db, id)
    if (!existing) throw new HttpError(404, 'not found')

    // A reset logs the user out everywhere — the old password's sessions go with it.
    db.transaction(() => {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), id)
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
    })()
    res.json(toUser(existing))
  }
}

function deleteHandler(
  db: Database.Database,
  uploadsDir: string,
  storedNames: StoredNamesForUser,
) {
  return (req: Request, res: Response) => {
    const id = Number(req.params.id)
    if (id === req.userId) throw new HttpError(400, 'cannot delete yourself')

    const files = storedNames.all(id)

    // applications cascade to attachments, and the user cascades to sessions.
    const deleted = db.transaction(() => {
      db.prepare('DELETE FROM applications WHERE user_id = ?').run(id)
      return db.prepare('DELETE FROM users WHERE id = ?').run(id).changes
    })()

    if (deleted === 0) throw new HttpError(404, 'not found')

    for (const file of files) {
      unlinkIfExists(join(uploadsDir, file.stored_name))
    }

    res.status(204).end()
  }
}

export function createUsersRouter(db: Database.Database, uploadsDir: string): Router {
  const router = Router()
  const storedNames: StoredNamesForUser = db.prepare(
    `SELECT a.stored_name FROM attachments a
       JOIN applications app ON app.id = a.application_id
      WHERE app.user_id = ?`,
  )

  router.get('/users', listHandler(db))
  router.post('/users', createHandler(db))
  router.put('/users/:id/role', roleHandler(db))
  router.put('/users/:id/password', passwordHandler(db))
  router.delete('/users/:id', deleteHandler(db, uploadsDir, storedNames))

  return router
}
