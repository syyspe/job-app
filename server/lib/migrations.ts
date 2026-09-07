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

export function migrate(db: Database.Database): void {
  migrateApplicationDates(db)
}
