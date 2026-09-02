import { openDatabase } from './db.ts'
import { createApp } from './app.ts'

const dataDir = process.env.DATA_DIR ?? new URL('./data', import.meta.url).pathname
const db = openDatabase(dataDir)
const app = createApp(db, dataDir)

app.listen(3001, () => {
  console.log(`API listening on http://localhost:3001 (data: ${dataDir})`)
})
