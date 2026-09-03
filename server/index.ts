import { join } from 'node:path'
import { openDatabase } from './db.ts'
import { createApp } from './app.ts'

const dbPath = process.env.DB_PATH
const uploadsDir = process.env.UPLOADS_DIR
if (!dbPath || !uploadsDir) {
  throw new Error('DB_PATH and UPLOADS_DIR must both be set (see .env.example)')
}

const staticDir = join(import.meta.dirname, '../dist')
const port = Number(process.env.PORT) || 3001

const db = openDatabase(dbPath)
const app = createApp(db, uploadsDir, { staticDir })

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port} (db: ${dbPath}, uploads: ${uploadsDir})`)
})
