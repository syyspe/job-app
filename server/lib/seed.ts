import type Database from 'better-sqlite3'
import { hashPassword } from './passwords.ts'
import type { UserRow } from '../models/user.ts'
import { setUserRole } from './users.ts'

export function createUser(db: Database.Database, username: string, password: string): number {
  const result = db
    .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
    .run(username, hashPassword(password))
  return Number(result.lastInsertRowid)
}

/** The seeded user is the way an admin comes into being — every run grants it. */
export function seedUser(db: Database.Database, username: string, password: string): number {
  const existing = db
    .prepare('SELECT * FROM users WHERE username = ?')
    .get(username) as UserRow | undefined
  const id = existing ? existing.id : createUser(db, username, password)
  setUserRole(db, id, 'admin')
  return id
}

export function migrateApplicationsToUser(db: Database.Database, userId: number): void {
  const columns = db.pragma('table_info(applications)') as { name: string }[]
  if (columns.some((column) => column.name === 'user_id')) return

  db.pragma('foreign_keys = OFF')
  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE applications_new (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id      INTEGER NOT NULL REFERENCES users(id),
          company      TEXT NOT NULL,
          role         TEXT NOT NULL,
          date_applied TEXT NOT NULL,
          deadline     TEXT NOT NULL DEFAULT '',
          status       TEXT NOT NULL,
          link         TEXT NOT NULL DEFAULT '',
          notes        TEXT NOT NULL DEFAULT '',
          created_at   TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `)
      db.prepare(
        `INSERT INTO applications_new
           (id, user_id, company, role, date_applied, deadline, status, link, notes,
            created_at, updated_at)
         SELECT id, ?, company, role, date_applied, deadline, status, link, notes,
                created_at, updated_at
         FROM applications`,
      ).run(userId)
      db.exec('DROP TABLE applications')
      db.exec('ALTER TABLE applications_new RENAME TO applications')
    })()
    const violations = db.pragma('foreign_key_check') as unknown[]
    if (violations.length > 0) {
      throw new Error(`foreign key violations after migration: ${JSON.stringify(violations)}`)
    }
  } finally {
    db.pragma('foreign_keys = ON')
  }
}
