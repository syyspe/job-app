// npm run profile:sync — copies the attachments marked in job-app into
// syncFolder, rebuilds the profile index and clears the marks.
import { mkdirSync } from 'node:fs'
import { CliError, runCommand } from '../../lib/cliError.ts'
import { configPath, envPath, indexPath } from '../../lib/paths.ts'
import { loadProfileConfig } from '../../profile/lib/config.ts'
import { checkOllama, createOllama } from '../../profile/lib/ollama.ts'
import { openIndex } from '../../profile/lib/store.ts'
import { loadJobAppEnv } from '../lib/env.ts'
import { createJobAppClient } from '../lib/jobApp.ts'
import { formatSyncResult, syncProfile } from '../lib/sync.ts'

await runCommand(async () => {
  const path = configPath(process.env)
  const config = loadProfileConfig(path)
  const syncFolder = config.syncFolder
  if (!syncFolder) throw new CliError(2, `${path}: syncFolder is required for profile:sync`)
  const env = envPath(process.env)
  const jobApp = createJobAppClient({ ...loadJobAppEnv(env), envPath: env })
  const health = await checkOllama(config)
  if (!health.ok) throw new CliError(1, `Ollama health check failed: ${health.reason}`)
  mkdirSync(syncFolder, { recursive: true })
  const store = openIndex(indexPath(process.env))
  try {
    const ollama = createOllama({ url: config.ollamaUrl, model: config.embeddingModel })
    const result = await syncProfile({ jobApp, config: { ...config, syncFolder }, store, ollama })
    for (const line of formatSyncResult(result)) console.log(line)
  } finally {
    store.close()
  }
})
