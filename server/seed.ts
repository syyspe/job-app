import { openDatabase } from './db/index.ts'
import { seedUser, migrateApplicationsToUser } from './lib/seed.ts'

const dbPath = process.env.DB_PATH
const username = process.env.SEED_USERNAME
const password = process.env.SEED_PASSWORD
if (!dbPath || !username || !password) {
  throw new Error('DB_PATH, SEED_USERNAME and SEED_PASSWORD must all be set (see .env.example)')
}

const db = openDatabase(dbPath)
const userId = seedUser(db, username, password)
migrateApplicationsToUser(db, userId)
