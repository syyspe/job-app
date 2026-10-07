import { join } from 'node:path'
import { openDatabase } from './db/index.ts'
import { createApp } from './app.ts'
import { parseLogLevel, parsePageSize } from './lib/config.ts'
import { createLogger } from './lib/logger.ts'

const dbPath = process.env.DB_PATH
const uploadsDir = process.env.UPLOADS_DIR
if (!dbPath || !uploadsDir) {
  console.error('DB_PATH and UPLOADS_DIR must both be set (see .env.example)')
  process.exit(2)
}

function readOrExit<T>(read: () => T): T {
  try {
    return read()
  } catch (error) {
    console.error((error as Error).message)
    process.exit(2)
  }
}

const pageSize = readOrExit(() => parsePageSize(process.env.PAGE_SIZE))
const logLevel = readOrExit(() => parseLogLevel(process.env.LOG_LEVEL))
const logger = createLogger(logLevel)

const staticDir = join(import.meta.dirname, '../dist')
const port = process.env.PORT === undefined ? 3001 : Number(process.env.PORT)

const db = openDatabase(dbPath)
const app = createApp(db, uploadsDir, { staticDir, pageSize, logger })

app.listen(port, () => {
  logger.info('api listening', { port, logLevel, db: dbPath, uploads: uploadsDir, pageSize })
})
