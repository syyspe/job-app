import type Database from 'better-sqlite3'
import type { Role } from '../types.ts'

export function setUserRole(db: Database.Database, userId: number, role: Role): void {
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId)
}

export function adminCount(db: Database.Database): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin'`)
    .get() as { n: number }
  return row.n
}
