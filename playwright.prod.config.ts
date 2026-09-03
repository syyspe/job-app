import { defineConfig } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dataDir = mkdtempSync(join(tmpdir(), 'job-app-e2e-prod-'))
const port = 3002 // distinct from dev:server's 3001, so both configs can coexist

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: 'npm start',
    url: `http://localhost:${port}/api/applications`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000, // npm start runs a full build first
    env: {
      PORT: String(port),
      DB_PATH: join(dataDir, 'app.db'),
      UPLOADS_DIR: join(dataDir, 'uploads'),
    },
  },
})
