import { join } from 'node:path'
import { openDatabase } from './db/index.ts'
import { createApp } from './app.ts'
import { parsePageSize } from './lib/config.ts'

const dbPath = process.env.DB_PATH
const uploadsDir = process.env.UPLOADS_DIR
if (!dbPath || !uploadsDir) {
  console.error('DB_PATH and UPLOADS_DIR must both be set (see .env.example)')
  process.exit(2)
}

function readPageSize(): number {
  try {
    return parsePageSize(process.env.PAGE_SIZE)
  } catch (error) {
    console.error((error as Error).message)
    process.exit(2)
  }
}

const pageSize = readPageSize()

const staticDir = join(import.meta.dirname, '../dist')
const port = process.env.PORT === undefined ? 3001 : Number(process.env.PORT)

const db = openDatabase(dbPath)
const app = createApp(db, uploadsDir, { staticDir, pageSize })

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port} (db: ${dbPath}, uploads: ${uploadsDir}, page size: ${pageSize})`)
})
