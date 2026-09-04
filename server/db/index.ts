import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export function openDatabase(dbPath: string): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS applications (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      company      TEXT NOT NULL,
      role         TEXT NOT NULL,
      date_applied TEXT NOT NULL,
      status       TEXT NOT NULL,
      link         TEXT NOT NULL DEFAULT '',
      notes        TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL
                     REFERENCES applications(id) ON DELETE CASCADE,
      stored_name    TEXT NOT NULL,
      original_name  TEXT NOT NULL,
      mime_type      TEXT NOT NULL
    );
  `)

  return db
}
