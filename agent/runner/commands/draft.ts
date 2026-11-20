// npm run agent:draft — drafts an application for each of the oldest
// suitable ads, each in its own sandboxed claude -p step.
import { join } from 'node:path'
import { runCommand } from '../../lib/cliError.ts'
import { configPath, envPath, promptsDir, stateDir } from '../../lib/paths.ts'
import { loadProfileConfig, readConfigFile } from '../../profile/lib/config.ts'
import { checkOllama } from '../../profile/lib/ollama.ts'
import { DRAFT_FRAMING, DRAFT_PROMPT, DRAFT_SCHEMA, writeDraft } from '../lib/draft.ts'
import { formatDraftReport, runDrafting } from '../lib/draftRun.ts'
import { loadJobAppEnv } from '../lib/env.ts'
import { createJobAppClient } from '../lib/jobApp.ts'
import type { Ad } from '../lib/jobApp.ts'
import { buildSystemPrompt } from '../lib/prompts.ts'
import { loadDraftConfig } from '../lib/runnerConfig.ts'
import { runSandboxed } from '../lib/sandbox.ts'
import { requirePassedCheck } from '../lib/sandboxCheck.ts'

const CLAUDE_BIN = 'claude'

// The local date, YYYY-MM-DD: the Swedish locale writes dates in that form.
function localDate(): string {
  return new Date().toLocaleDateString('sv-SE')
}

await runCommand(async () => {
  const path = configPath(process.env)
  const profileConfig = loadProfileConfig(path)
  const config = loadDraftConfig(path)
  const systemPrompt = buildSystemPrompt(DRAFT_FRAMING, readConfigFile(join(promptsDir(process.env), 'draft.md')))
  const cvTemplates = { fi: readConfigFile(config.cvTemplates.fi), en: readConfigFile(config.cvTemplates.en) }
  const env = envPath(process.env)
  const jobApp = createJobAppClient({ ...loadJobAppEnv(env), envPath: env })
  requirePassedCheck(CLAUDE_BIN, stateDir(process.env))
  const step = { claudeBin: CLAUDE_BIN, prompt: DRAFT_PROMPT, systemPrompt, schema: DRAFT_SCHEMA }
  const runStep = (input: string) => runSandboxed({ ...step, input, timeoutMs: config.timeoutMs, env: process.env })
  const write = (ad: Ad) => writeDraft(ad, cvTemplates, runStep)
  const checkHealth = () => checkOllama(profileConfig)
  const report = await runDrafting({ jobApp, config, checkHealth, write, today: localDate() })
  for (const line of formatDraftReport(report)) console.log(line)
})
