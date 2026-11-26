// npm run agent:draft — drafts an application for each of the oldest
// suitable ads, each in its own step on the configured engine.
import { join } from 'node:path'
import { runCommand } from '../../lib/cliError.ts'
import { configPath, envPath, promptsDir, stateDir } from '../../lib/paths.ts'
import { loadProfileConfig, readConfigFile } from '../../profile/lib/config.ts'
import { checkOllama } from '../../profile/lib/ollama.ts'
import { DRAFT_FRAMING, DRAFT_PROMPT, DRAFT_SCHEMA, writeDraft } from '../lib/draft.ts'
import { formatDraftReport, runDrafting } from '../lib/draftRun.ts'
import { loadEngine } from '../lib/engine.ts'
import { loadJobAppEnv } from '../lib/env.ts'
import { createJobAppClient } from '../lib/jobApp.ts'
import type { Ad } from '../lib/jobApp.ts'
import { buildSystemPrompt } from '../lib/prompts.ts'
import { loadDraftConfig } from '../lib/runnerConfig.ts'
import { requirePassedCheck } from '../lib/sandboxCheck.ts'

// The local date, YYYY-MM-DD: the Swedish locale writes dates in that form.
function localDate(): string {
  return new Date().toLocaleDateString('sv-SE')
}

await runCommand(async () => {
  const path = configPath(process.env)
  const profileConfig = loadProfileConfig(path)
  const config = loadDraftConfig(path)
  const engine = loadEngine(process.env, profileConfig)
  const systemPrompt = buildSystemPrompt(DRAFT_FRAMING, readConfigFile(join(promptsDir(process.env), 'draft.md')))
  const cvTemplates = { fi: readConfigFile(config.cvTemplates.fi), en: readConfigFile(config.cvTemplates.en) }
  const env = envPath(process.env)
  const jobApp = createJobAppClient({ ...loadJobAppEnv(env), envPath: env })
  if (engine.kind === 'cli') requirePassedCheck('claude', stateDir(process.env))
  const step = { prompt: DRAFT_PROMPT, systemPrompt, schema: DRAFT_SCHEMA }
  const runStep = engine.stepFor({ step: 'drafting', ...step, timeoutMs: config.timeoutMs })
  const write = (ad: Ad) => writeDraft(ad, cvTemplates, runStep)
  const checkHealth = () => checkOllama(profileConfig)
  const canStart = () => engine.budget.canStart()
  const report = await runDrafting({ jobApp, config, checkHealth, write, canStart, today: localDate() })
  for (const line of formatDraftReport(report)) console.log(line)
  const stopped = engine.budget.stopReason()
  if (stopped) console.log(`stopped: ${stopped}`)
})
