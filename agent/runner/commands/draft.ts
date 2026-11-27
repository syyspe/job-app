// npm run agent:draft -- <ad id> — drafts an application for one suitable ad,
// always on the sandboxed claude -p, whatever config's engine key says. The
// server spawns it when the user clicks Draft.
import { join } from 'node:path'
import { CliError, runCommand } from '../../lib/cliError.ts'
import { configPath, envPath, promptsDir, stateDir } from '../../lib/paths.ts'
import type { Env } from '../../lib/paths.ts'
import { loadProfileConfig, readConfigFile } from '../../profile/lib/config.ts'
import { checkOllama } from '../../profile/lib/ollama.ts'
import { DRAFT_FRAMING, DRAFT_PROMPT, DRAFT_SCHEMA, writeDraft } from '../lib/draft.ts'
import { draftNamedAd, formatDraftReport } from '../lib/draftRun.ts'
import type { DraftRunOptions } from '../lib/draftRun.ts'
import { cliStep } from '../lib/engine.ts'
import { loadJobAppEnv } from '../lib/env.ts'
import { createJobAppClient } from '../lib/jobApp.ts'
import type { Ad } from '../lib/jobApp.ts'
import { acquireRunLock } from '../lib/lock.ts'
import { buildSystemPrompt } from '../lib/prompts.ts'
import { loadDraftConfig } from '../lib/runnerConfig.ts'
import { ensureSandboxVerified } from '../lib/sandboxCheck.ts'
import { runProbes } from '../lib/sandboxProbes.ts'
import { localDate } from '../lib/state.ts'

const CLAUDE_BIN = 'claude'
const USAGE = 'usage: npm run agent:draft -- <ad id>'

function parseAdId(args: string[]): number {
  const [id, ...rest] = args
  if (!id || rest.length > 0 || !/^[1-9]\d*$/.test(id)) throw new CliError(2, USAGE)
  return Number(id)
}

// Everything read from config, prompts and env, before the lock is taken.
function loadOptions(env: Env): DraftRunOptions {
  const path = configPath(env)
  const profile = loadProfileConfig(path)
  const config = loadDraftConfig(path)
  const systemPrompt = buildSystemPrompt(DRAFT_FRAMING, readConfigFile(join(promptsDir(env), 'draft.md')))
  const cvTemplates = { fi: readConfigFile(config.cvTemplates.fi), en: readConfigFile(config.cvTemplates.en) }
  const runStep = cliStep(env, { prompt: DRAFT_PROMPT, systemPrompt, schema: DRAFT_SCHEMA, timeoutMs: config.timeoutMs })
  const envFile = envPath(env)
  return {
    jobApp: createJobAppClient({ ...loadJobAppEnv(envFile), envPath: envFile }),
    config,
    checkHealth: () => checkOllama(profile),
    write: (ad: Ad) => writeDraft(ad, cvTemplates, runStep),
    today: localDate(new Date()),
  }
}

async function verifySandbox(state: string): Promise<void> {
  const probes = () => runProbes({ claudeBin: CLAUDE_BIN, env: process.env, timeoutMs: 180000 })
  const { version, reverified } = await ensureSandboxVerified({
    claudeBin: CLAUDE_BIN,
    stateDir: state,
    runProbes: probes,
    now: () => new Date(),
  })
  if (reverified) console.log(`sandbox re-verified for claude ${version}`)
}

await runCommand(async () => {
  const adId = parseAdId(process.argv.slice(2))
  const options = loadOptions(process.env)
  const state = stateDir(process.env)
  const release = acquireRunLock(state)
  try {
    await verifySandbox(state)
    const report = await draftNamedAd(options, adId)
    console.log(formatDraftReport(report))
    if (report.result !== 'drafted') process.exitCode = 1
  } finally {
    release()
  }
})
