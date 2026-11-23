import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { migrate } from '../lib/migrations.ts'

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'basic',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS applications (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    company      TEXT NOT NULL,
    role         TEXT NOT NULL,
    date_applied TEXT NOT NULL,
    deadline     TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL,
    link         TEXT NOT NULL DEFAULT '',
    notes        TEXT NOT NULL DEFAULT '',
    archived     INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ads (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source         TEXT NOT NULL,
    source_mode    TEXT NOT NULL,
    external_id    TEXT NOT NULL,
    url            TEXT NOT NULL,
    canonical_url  TEXT NOT NULL,
    title          TEXT NOT NULL DEFAULT '',
    company        TEXT NOT NULL DEFAULT '',
    location       TEXT NOT NULL DEFAULT '',
    deadline       TEXT NOT NULL DEFAULT '',
    state          TEXT NOT NULL,
    body           TEXT,
    evaluation     TEXT,
    prescreen      TEXT,
    fetch_requested_at TEXT,
    application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
    duplicate_of   INTEGER REFERENCES ads(id) ON DELETE SET NULL,
    attempts       INTEGER NOT NULL DEFAULT 0,
    last_error     TEXT,
    first_seen_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
    reported_at    TEXT,
    UNIQUE (user_id, source, external_id)
  );

  CREATE TABLE IF NOT EXISTS attachments (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL
                   REFERENCES applications(id) ON DELETE CASCADE,
    stored_name    TEXT NOT NULL,
    original_name  TEXT NOT NULL,
    mime_type      TEXT NOT NULL,
    uploaded_at    TEXT NOT NULL DEFAULT '',
    profile_sync   INTEGER NOT NULL DEFAULT 0
  );
`

export function openDatabase(dbPath: string): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  migrate(db)
  return db
}
