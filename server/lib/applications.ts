import type Database from 'better-sqlite3'

/** Callers have already checked the application belongs to the session user. */
export function touchApplication(db: Database.Database, id: number): void {
  db.prepare("UPDATE applications SET updated_at = datetime('now') WHERE id = ?").run(id)
}
