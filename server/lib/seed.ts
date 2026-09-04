import type Database from 'better-sqlite3'
import { hashPassword } from './passwords.ts'
import type { UserRow } from '../models/user.ts'

export function createUser(db: Database.Database, username: string, password: string): number {
  const result = db
    .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
    .run(username, hashPassword(password))
  return Number(result.lastInsertRowid)
}

export function seedUser(db: Database.Database, username: string, password: string): number {
  const existing = db
    .prepare('SELECT * FROM users WHERE username = ?')
    .get(username) as UserRow | undefined
  if (existing) return existing.id
  return createUser(db, username, password)
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
          status       TEXT NOT NULL,
          link         TEXT NOT NULL DEFAULT '',
          notes        TEXT NOT NULL DEFAULT ''
        );
      `)
      db.prepare(
        `INSERT INTO applications_new
           (id, user_id, company, role, date_applied, status, link, notes)
         SELECT id, ?, company, role, date_applied, status, link, notes
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
