// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from './index.ts'

let root: string
let dbPath: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'job-app-db-test-'))
  dbPath = join(root, 'app.db')
  const legacy = new Database(dbPath)
  legacy.exec(`
    CREATE TABLE applications (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL,
      company      TEXT NOT NULL,
      role         TEXT NOT NULL,
      date_applied TEXT NOT NULL,
      status       TEXT NOT NULL,
      link         TEXT NOT NULL DEFAULT '',
      notes        TEXT NOT NULL DEFAULT ''
    );
  `)
  legacy
    .prepare(
      `INSERT INTO applications (id, user_id, company, role, date_applied, status, link, notes)
       VALUES (1, 1, 'Acme', 'Engineer', '2026-01-01', 'applied', '', '')`,
    )
    .run()
  legacy.close()
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

test('opening a database whose applications table predates the date columns migrates it', () => {
  const db = openDatabase(dbPath)

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

  db.close()
})

test('opening the same database twice leaves the migrated timestamps alone', () => {
  const first = openDatabase(dbPath)
  const before = first.prepare('SELECT created_at FROM applications WHERE id = 1').get() as {
    created_at: string
  }
  first.close()

  const second = openDatabase(dbPath)
  const after = second.prepare('SELECT created_at FROM applications WHERE id = 1').get() as {
    created_at: string
  }
  expect(after.created_at).toBe(before.created_at)
  second.close()
})
