// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  migrateAdFetch,
  migrateAgentRunsDraft,
  migrateApplicationArchived,
  migrateApplicationDates,
  migrateAttachmentEditedFrom,
  migrateAttachmentProfileSync,
  migrateAttachmentUploadedAt,
  migrateUserAgentAccess,
  migrateUserRole,
} from './migrations.ts'

let root: string
let db: Database.Database

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'job-app-migrations-test-'))
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

    CREATE TABLE ads (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT ''
    );
  `)
  db.prepare(`INSERT INTO ads (id, title) VALUES (1, 'Engineer')`).run()
  db.prepare(
    `INSERT INTO applications (id, company, role, date_applied, status, link, notes)
     VALUES (1, 'Acme', 'Engineer', '2026-01-01', 'applied', '', '')`,
  ).run()
  db.prepare(
    `INSERT INTO users (id, username, password_hash) VALUES (1, 'testuser', 'hash')`,
  ).run()
  db.prepare(
    `INSERT INTO attachments (id, application_id, stored_name, original_name, mime_type)
     VALUES (1, 1, 'a1.pdf', 'cv.pdf', 'application/pdf')`,
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

test('migrating a legacy database adds archived, unarchived, to existing rows', () => {
  migrateApplicationArchived(db)

  const application = db.prepare('SELECT * FROM applications WHERE id = 1').get() as {
    company: string
    archived: number
  }
  expect(application.company).toBe('Acme')
  expect(application.archived).toBe(0)
})

test('migrating archived twice is a no-op the second time', () => {
  migrateApplicationArchived(db)
  db.prepare('UPDATE applications SET archived = 1 WHERE id = 1').run()

  expect(() => migrateApplicationArchived(db)).not.toThrow()
  const application = db.prepare('SELECT archived FROM applications WHERE id = 1').get() as {
    archived: number
  }
  expect(application.archived).toBe(1)
})

test('migrating a legacy database gives existing users the basic role', () => {
  migrateUserRole(db)

  const user = db.prepare('SELECT * FROM users WHERE id = 1').get() as {
    username: string
    role: string
  }
  expect(user.username).toBe('testuser')
  expect(user.role).toBe('basic')
})

test('migrating the user role twice is a no-op the second time', () => {
  migrateUserRole(db)
  db.prepare(`UPDATE users SET role = 'admin' WHERE id = 1`).run()

  expect(() => migrateUserRole(db)).not.toThrow()
  const user = db.prepare('SELECT role FROM users WHERE id = 1').get() as { role: string }
  expect(user.role).toBe('admin')
})

test('migrating a legacy database grants agent access to admins and not to basic users', () => {
  migrateUserRole(db)
  db.prepare(`UPDATE users SET role = 'admin' WHERE id = 1`).run()
  db.prepare(
    `INSERT INTO users (id, username, password_hash) VALUES (2, 'basicuser', 'hash')`,
  ).run()

  migrateUserAgentAccess(db)

  const rows = db.prepare('SELECT id, agent_access FROM users ORDER BY id').all() as {
    id: number
    agent_access: number
  }[]
  expect(rows).toEqual([
    { id: 1, agent_access: 1 },
    { id: 2, agent_access: 0 },
  ])
})

test('migrating agent access twice is a no-op the second time', () => {
  migrateUserRole(db)
  db.prepare(`UPDATE users SET role = 'admin' WHERE id = 1`).run()
  migrateUserAgentAccess(db)
  db.prepare('UPDATE users SET agent_access = 0 WHERE id = 1').run()

  expect(() => migrateUserAgentAccess(db)).not.toThrow()
  const user = db.prepare('SELECT agent_access FROM users WHERE id = 1').get() as {
    agent_access: number
  }
  expect(user.agent_access).toBe(0)
})

test('migrating a legacy database gives existing attachments an empty uploaded_at', () => {
  migrateAttachmentUploadedAt(db)

  const attachment = db.prepare('SELECT * FROM attachments WHERE id = 1').get() as {
    original_name: string
    uploaded_at: string
  }
  expect(attachment.original_name).toBe('cv.pdf')
  expect(attachment.uploaded_at).toBe('')
})

test('migrating uploaded_at twice is a no-op the second time', () => {
  migrateAttachmentUploadedAt(db)
  db.prepare(`UPDATE attachments SET uploaded_at = '2026-01-01 00:00:00' WHERE id = 1`).run()

  expect(() => migrateAttachmentUploadedAt(db)).not.toThrow()
  const attachment = db.prepare('SELECT uploaded_at FROM attachments WHERE id = 1').get() as {
    uploaded_at: string
  }
  expect(attachment.uploaded_at).toBe('2026-01-01 00:00:00')
})

test('migrating a legacy database leaves existing attachments unmarked for profile sync', () => {
  migrateAttachmentProfileSync(db)

  const attachment = db.prepare('SELECT * FROM attachments WHERE id = 1').get() as {
    original_name: string
    profile_sync: number
  }
  expect(attachment.original_name).toBe('cv.pdf')
  expect(attachment.profile_sync).toBe(0)
})

test('migrating profile_sync twice is a no-op the second time', () => {
  migrateAttachmentProfileSync(db)
  db.prepare('UPDATE attachments SET profile_sync = 1 WHERE id = 1').run()

  expect(() => migrateAttachmentProfileSync(db)).not.toThrow()
  const attachment = db.prepare('SELECT profile_sync FROM attachments WHERE id = 1').get() as {
    profile_sync: number
  }
  expect(attachment.profile_sync).toBe(1)
})

test('migrating a legacy database gives existing ads no pre-screen and no fetch request', () => {
  migrateAdFetch(db)

  const ad = db.prepare('SELECT * FROM ads WHERE id = 1').get() as {
    title: string
    prescreen: string | null
    fetch_requested_at: string | null
  }
  expect(ad.title).toBe('Engineer')
  expect(ad.prescreen).toBeNull()
  expect(ad.fetch_requested_at).toBeNull()
})

test('migrating the ad fetch columns twice is a no-op the second time', () => {
  migrateAdFetch(db)
  db.prepare(`UPDATE ads SET fetch_requested_at = '2026-01-01 00:00:00' WHERE id = 1`).run()

  expect(() => migrateAdFetch(db)).not.toThrow()
  const ad = db.prepare('SELECT fetch_requested_at FROM ads WHERE id = 1').get() as {
    fetch_requested_at: string
  }
  expect(ad.fetch_requested_at).toBe('2026-01-01 00:00:00')
})

test('migrating a legacy database leaves existing attachments as originals', () => {
  migrateAttachmentEditedFrom(db)

  const attachment = db.prepare('SELECT * FROM attachments WHERE id = 1').get() as {
    original_name: string
    edited_from: number | null
  }
  expect(attachment.original_name).toBe('cv.pdf')
  expect(attachment.edited_from).toBeNull()
})

test('migrating edited_from twice is a no-op the second time', () => {
  migrateAttachmentEditedFrom(db)
  db.prepare(
    `INSERT INTO attachments (id, application_id, stored_name, original_name, mime_type, edited_from)
     VALUES (2, 1, 'b.md', 'cv (edited).md', 'text/markdown', 1)`,
  ).run()

  expect(() => migrateAttachmentEditedFrom(db)).not.toThrow()
  const copy = db.prepare('SELECT edited_from FROM attachments WHERE id = 2').get() as {
    edited_from: number
  }
  expect(copy.edited_from).toBe(1)
})

test('deleting an original after the migration turns its copy into an original', () => {
  migrateAttachmentEditedFrom(db)
  db.prepare(
    `INSERT INTO attachments (id, application_id, stored_name, original_name, mime_type, edited_from)
     VALUES (2, 1, 'b.md', 'cv (edited).md', 'text/markdown', 1)`,
  ).run()

  db.prepare('DELETE FROM attachments WHERE id = 1').run()

  const copy = db.prepare('SELECT edited_from FROM attachments WHERE id = 2').get() as {
    edited_from: number | null
  }
  expect(copy.edited_from).toBeNull()
})

function createLegacyAgentRuns(): void {
  db.exec(`
    CREATE TABLE agent_runs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      kind        TEXT NOT NULL CHECK (kind IN ('run', 'collect')),
      started_by  INTEGER NOT NULL REFERENCES users(id),
      started_at  TEXT NOT NULL,
      finished_at TEXT,
      exit_code   INTEGER,
      output      TEXT NOT NULL DEFAULT ''
    );
    INSERT INTO agent_runs (id, kind, started_by, started_at, finished_at, exit_code, output)
      VALUES (1, 'collect', 1, '2026-01-01 00:00:00', '2026-01-01 00:01:00', 0, 'collected 3');
  `)
}

const INSERT_DRAFT_RUN = `INSERT INTO agent_runs (kind, ad_id, started_by, started_at)
  VALUES ('draft', 1, 1, '2026-01-02 00:00:00')`

test('migrating agent_runs keeps the old rows with no ad and accepts draft runs afterwards', () => {
  createLegacyAgentRuns()
  migrateAgentRunsDraft(db)

  const run = db.prepare('SELECT * FROM agent_runs WHERE id = 1').get() as {
    kind: string
    output: string
    exit_code: number
    ad_id: number | null
  }
  expect(run).toMatchObject({ kind: 'collect', output: 'collected 3', exit_code: 0, ad_id: null })
  expect(() => db.prepare(INSERT_DRAFT_RUN).run()).not.toThrow()
})

test('migrating agent_runs twice is a no-op the second time', () => {
  createLegacyAgentRuns()
  migrateAgentRunsDraft(db)
  db.prepare(INSERT_DRAFT_RUN).run()

  expect(() => migrateAgentRunsDraft(db)).not.toThrow()
  const count = db.prepare('SELECT COUNT(*) AS n FROM agent_runs').get() as { n: number }
  expect(count.n).toBe(2)
})
