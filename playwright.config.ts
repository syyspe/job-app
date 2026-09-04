import { defineConfig } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TEST_PASSWORD, TEST_USERNAME } from './e2e/credentials.ts'

const dataDir = mkdtempSync(join(tmpdir(), 'job-app-e2e-'))

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:5173' },
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run seed && node server/index.ts',
      url: 'http://localhost:3001/api/applications',
      reuseExistingServer: !process.env.CI,
      env: {
        DB_PATH: join(dataDir, 'app.db'),
        UPLOADS_DIR: join(dataDir, 'uploads'),
        SEED_USERNAME: TEST_USERNAME,
        SEED_PASSWORD: TEST_PASSWORD,
      },
    },
  ],
})
