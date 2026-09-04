// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { seedUser, migrateApplicationsToUser } from './seed.ts'

let root: string
let db: Database.Database

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'job-app-seed-test-'))
  db = new Database(join(root, 'app.db'))
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE applications (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      company      TEXT NOT NULL,
      role         TEXT NOT NULL,
      date_applied TEXT NOT NULL,
      status       TEXT NOT NULL,
      link         TEXT NOT NULL DEFAULT '',
      notes        TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE attachments (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL
                     REFERENCES applications(id) ON DELETE CASCADE,
      stored_name    TEXT NOT NULL,
      original_name  TEXT NOT NULL,
      mime_type      TEXT NOT NULL
    );
  `)
  db.prepare(
    `INSERT INTO applications (id, company, role, date_applied, status, link, notes)
     VALUES (1, 'Acme', 'Engineer', '2026-01-01', 'applied', '', '')`,
  ).run()
  db.prepare(
    `INSERT INTO attachments (application_id, stored_name, original_name, mime_type)
     VALUES (1, 'stored.txt', 'resume.txt', 'text/plain')`,
  ).run()
})

afterEach(() => {
  db.close()
  rmSync(root, { recursive: true, force: true })
})

test('migrating a legacy database assigns every application to the seeded user and keeps its attachments', () => {
  const userId = seedUser(db, 'testuser', 'test-password')
  migrateApplicationsToUser(db, userId)

  const application = db.prepare('SELECT * FROM applications WHERE id = 1').get() as {
    user_id: number
    company: string
  }
  expect(application.user_id).toBe(userId)
  expect(application.company).toBe('Acme')

  const attachment = db
    .prepare('SELECT * FROM attachments WHERE application_id = 1')
    .get() as { original_name: string }
  expect(attachment.original_name).toBe('resume.txt')

  expect(() =>
    db
      .prepare(
        `INSERT INTO applications (company, role, date_applied, status, link, notes)
         VALUES ('X', 'Y', '2026-01-01', 'applied', '', '')`,
      )
      .run(),
  ).toThrow()
})

test('migrating twice is a no-op the second time', () => {
  const userId = seedUser(db, 'testuser', 'test-password')
  migrateApplicationsToUser(db, userId)
  expect(() => migrateApplicationsToUser(db, userId)).not.toThrow()

  const application = db.prepare('SELECT * FROM applications WHERE id = 1').get() as {
    user_id: number
  }
  expect(application.user_id).toBe(userId)
})

test('seeding twice does not create a second user', () => {
  const firstId = seedUser(db, 'testuser', 'test-password')
  const secondId = seedUser(db, 'testuser', 'test-password')
  expect(secondId).toBe(firstId)

  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }
  expect(count.n).toBe(1)
})
