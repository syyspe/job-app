import { openDatabase } from './db.ts'
import { createApp } from './app.ts'

const dbPath = process.env.DB_PATH
const uploadsDir = process.env.UPLOADS_DIR
if (!dbPath || !uploadsDir) {
  throw new Error('DB_PATH and UPLOADS_DIR must both be set (see .env.example)')
}

const db = openDatabase(dbPath)
const app = createApp(db, uploadsDir)

app.listen(3001, () => {
  console.log(`API listening on http://localhost:3001 (db: ${dbPath}, uploads: ${uploadsDir})`)
})
