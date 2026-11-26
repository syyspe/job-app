import type Database from 'better-sqlite3'

export function migrateApplicationDates(db: Database.Database): void {
  const columns = db.pragma('table_info(applications)') as { name: string }[]
  if (columns.some((column) => column.name === 'deadline')) return

  db.transaction(() => {
    db.exec(`
      ALTER TABLE applications ADD COLUMN deadline TEXT NOT NULL DEFAULT '';
      ALTER TABLE applications ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
      ALTER TABLE applications ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
      UPDATE applications
         SET created_at = datetime('now'), updated_at = datetime('now');
    `)
  })()
}

export function migrateApplicationArchived(db: Database.Database): void {
  const columns = db.pragma('table_info(applications)') as { name: string }[]
  if (columns.some((column) => column.name === 'archived')) return

  db.exec('ALTER TABLE applications ADD COLUMN archived INTEGER NOT NULL DEFAULT 0')
}

export function migrateUserRole(db: Database.Database): void {
  const columns = db.pragma('table_info(users)') as { name: string }[]
  if (columns.some((column) => column.name === 'role')) return

  db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'basic'`)
}

// Existing admins keep the agent runs they had when only admins could start them.
export function migrateUserAgentAccess(db: Database.Database): void {
  const columns = db.pragma('table_info(users)') as { name: string }[]
  if (columns.some((column) => column.name === 'agent_access')) return

  db.transaction(() => {
    db.exec(`
      ALTER TABLE users ADD COLUMN agent_access INTEGER NOT NULL DEFAULT 0;
      UPDATE users SET agent_access = 1 WHERE role = 'admin';
    `)
  })()
}

export function migrateAttachmentUploadedAt(db: Database.Database): void {
  const columns = db.pragma('table_info(attachments)') as { name: string }[]
  if (columns.some((column) => column.name === 'uploaded_at')) return

  db.exec(`ALTER TABLE attachments ADD COLUMN uploaded_at TEXT NOT NULL DEFAULT ''`)
}

export function migrateAttachmentProfileSync(db: Database.Database): void {
  const columns = db.pragma('table_info(attachments)') as { name: string }[]
  if (columns.some((column) => column.name === 'profile_sync')) return

  db.exec('ALTER TABLE attachments ADD COLUMN profile_sync INTEGER NOT NULL DEFAULT 0')
}

export function migrateAttachmentEditedFrom(db: Database.Database): void {
  const columns = db.pragma('table_info(attachments)') as { name: string }[]
  if (columns.some((column) => column.name === 'edited_from')) return

  db.exec(
    'ALTER TABLE attachments ADD COLUMN edited_from INTEGER REFERENCES attachments(id) ON DELETE SET NULL',
  )
}

// A database from before the ads table has none to alter: SCHEMA creates it
// with both columns.
export function migrateAdFetch(db: Database.Database): void {
  const columns = db.pragma('table_info(ads)') as { name: string }[]
  if (columns.length === 0 || columns.some((column) => column.name === 'prescreen')) return

  db.transaction(() => {
    db.exec(`
      ALTER TABLE ads ADD COLUMN prescreen TEXT;
      ALTER TABLE ads ADD COLUMN fetch_requested_at TEXT;
    `)
  })()
}

export function migrate(db: Database.Database): void {
  migrateApplicationDates(db)
  migrateApplicationArchived(db)
  migrateUserRole(db)
  migrateUserAgentAccess(db)
  migrateAttachmentUploadedAt(db)
  migrateAttachmentProfileSync(db)
  migrateAttachmentEditedFrom(db)
  migrateAdFetch(db)
}
