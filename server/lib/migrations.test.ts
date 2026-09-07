// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrateApplicationDates } from './migrations.ts'

let root: string
let db: Database.Database

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'job-app-migrations-test-'))
  db = new Database(join(root, 'app.db'))
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE applications (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      company      TEXT NOT NULL,
      role         TEXT NOT NULL,
      date_applied TEXT NOT NULL,
      status       TEXT NOT NULL,
      link         TEXT NOT NULL DEFAULT '',
      notes        TEXT NOT NULL DEFAULT ''
    );
  `)
  db.prepare(
    `INSERT INTO applications (id, company, role, date_applied, status, link, notes)
     VALUES (1, 'Acme', 'Engineer', '2026-01-01', 'applied', '', '')`,
  ).run()
})

afterEach(() => {
  db.close()
  rmSync(root, { recursive: true, force: true })
})

test('migrating a legacy database adds deadline and timestamp columns and backfills the timestamps', () => {
  migrateApplicationDates(db)

  const application = db.prepare('SELECT * FROM applications WHERE id = 1').get() as {
    company: string
    deadline: string
    created_at: string
    updated_at: string
  }
  expect(application.company).toBe('Acme')
  expect(application.deadline).toBe('')
  expect(application.created_at).not.toBe('')
  expect(application.updated_at).not.toBe('')
})

test('migrating dates twice is a no-op the second time', () => {
  migrateApplicationDates(db)
  const first = db.prepare('SELECT created_at FROM applications WHERE id = 1').get() as {
    created_at: string
  }

  expect(() => migrateApplicationDates(db)).not.toThrow()
  const second = db.prepare('SELECT created_at FROM applications WHERE id = 1').get() as {
    created_at: string
  }
  expect(second.created_at).toBe(first.created_at)
})
