import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { CliError } from '../../lib/cliError.ts'
import type { Label } from './config.ts'

// The one file that knows how the index is stored: chunks and their vectors
// as Float32 blobs in plain SQLite, ranked by the caller in JS.

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS files (
    path   TEXT PRIMARY KEY,
    label  TEXT NOT NULL,
    source TEXT NOT NULL,
    hash   TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chunks (
    file_path TEXT NOT NULL REFERENCES files(path) ON DELETE CASCADE,
    ordinal   INTEGER NOT NULL,
    text      TEXT NOT NULL,
    vector    BLOB NOT NULL,
    PRIMARY KEY (file_path, ordinal)
  );
`

export const REBUILD_HINT = 'run npm run profile:index'

export interface IndexMeta {
  model: string
  dimensions: number
}

export interface IndexedFile {
  path: string
  label: Label
  source: string
  hash: string
}

export interface StoredChunk {
  source: string
  label: Label
  text: string
  vector: Float32Array
}

export interface IndexReader {
  readMeta: () => IndexMeta | undefined
  fileHashes: () => Map<string, { label: Label; hash: string }>
  allChunks: (label?: Label) => StoredChunk[]
  close: () => void
}

export interface IndexStore extends IndexReader {
  replaceFile: (file: IndexedFile, chunks: { text: string; vector: number[] }[]) => void
  removeFile: (path: string) => void
  resetIndex: () => void
  completeBuild: (model: string, dimensions: number) => void
}

function readMeta(db: Database.Database): IndexMeta | undefined {
  const rows = db.prepare('SELECT key, value FROM meta').all() as { key: string; value: string }[]
  const meta = new Map(rows.map((row) => [row.key, row.value]))
  const model = meta.get('model')
  if (model === undefined) return undefined
  return { model, dimensions: Number(meta.get('dimensions')) }
}

function fileHashes(db: Database.Database): Map<string, { label: Label; hash: string }> {
  const rows = db.prepare('SELECT path, label, hash FROM files').all() as IndexedFile[]
  return new Map(rows.map((row) => [row.path, { label: row.label, hash: row.hash }]))
}

function allChunks(db: Database.Database, label?: Label): StoredChunk[] {
  const rows = db
    .prepare(
      `SELECT files.source, files.label, chunks.text, chunks.vector
         FROM chunks JOIN files ON files.path = chunks.file_path
        WHERE ? IS NULL OR files.label = ?
        ORDER BY files.path, chunks.ordinal`,
    )
    .all(label ?? null, label ?? null) as (Omit<StoredChunk, 'vector'> & { vector: Buffer })[]
  // Copy each blob so the Float32Array view is 4-byte aligned.
  return rows.map((row) => ({ ...row, vector: new Float32Array(new Uint8Array(row.vector).buffer) }))
}

function writeOperations(db: Database.Database) {
  const removeFile = (path: string) => db.prepare('DELETE FROM files WHERE path = ?').run(path)
  const insertFile = db.prepare('INSERT INTO files (path, label, source, hash) VALUES (@path, @label, @source, @hash)')
  const insertChunk = db.prepare('INSERT INTO chunks (file_path, ordinal, text, vector) VALUES (?, ?, ?, ?)')
  const setMeta = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
  return {
    removeFile: (path: string) => void removeFile(path),
    replaceFile: db.transaction((file: IndexedFile, chunks: { text: string; vector: number[] }[]) => {
      removeFile(file.path)
      insertFile.run(file)
      chunks.forEach((chunk, ordinal) =>
        insertChunk.run(file.path, ordinal, chunk.text, Buffer.from(new Float32Array(chunk.vector).buffer)),
      )
    }),
    resetIndex: () => void db.exec('DELETE FROM chunks; DELETE FROM files; DELETE FROM meta;'),
    completeBuild: db.transaction((model: string, dimensions: number) => {
      setMeta.run('model', model)
      setMeta.run('dimensions', String(dimensions))
    }),
  }
}

function readOperations(db: Database.Database): IndexReader {
  return {
    readMeta: () => readMeta(db),
    fileHashes: () => fileHashes(db),
    allChunks: (label?: Label) => allChunks(db, label),
    close: () => void db.close(),
  }
}

export function openIndex(path: string): IndexStore {
  mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path)
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  return { ...readOperations(db), ...writeOperations(db) }
}

export function openReadonlyIndex(path: string): IndexReader {
  if (!existsSync(path)) throw new CliError(1, `no profile index at ${path}: ${REBUILD_HINT}`)
  return readOperations(new Database(path, { readonly: true, fileMustExist: true }))
}
