// npm run agent:evaluate — screens new ads by title, then evaluates the
// oldest ready ads, each in its own sandboxed claude -p step.
import { join } from 'node:path'
import { runCommand } from '../../lib/cliError.ts'
import { configPath, envPath, promptsDir, stateDir } from '../../lib/paths.ts'
import { loadProfileConfig, readConfigFile } from '../../profile/lib/config.ts'
import { checkOllama } from '../../profile/lib/ollama.ts'
import { loadJobAppEnv } from '../lib/env.ts'
import { EVALUATION_FRAMING, EVALUATION_PROMPT, EVALUATION_SCHEMA, evaluateAd } from '../lib/evaluate.ts'
import { runEvaluation } from '../lib/evaluationRun.ts'
import type { EvaluationReport } from '../lib/evaluationRun.ts'
import { createJobAppClient } from '../lib/jobApp.ts'
import { buildSystemPrompt } from '../lib/prompts.ts'
import { loadRunnerConfig } from '../lib/runnerConfig.ts'
import { runSandboxed } from '../lib/sandbox.ts'
import { requirePassedCheck } from '../lib/sandboxCheck.ts'

const CLAUDE_BIN = 'claude'

function printReport({ screened, skipped, evaluated, queued }: EvaluationReport): void {
  const { titleRejected, awaitingHandover, leftNew } = screened
  console.log(`screened: ${titleRejected} title_rejected, ${awaitingHandover} awaiting_handover, ${leftNew} left new`)
  if (skipped) {
    console.log(`evaluation skipped: ${skipped}`)
    return
  }
  const { suitable, unsuitable, retrying, failed } = evaluated
  console.log(`evaluated: ${suitable} suitable, ${unsuitable} unsuitable, ${retrying} retrying, ${failed} failed`)
  console.log(`queued: ${queued} ready ads over the per-run cap`)
}

await runCommand(async () => {
  const path = configPath(process.env)
  const profileConfig = loadProfileConfig(path)
  const config = loadRunnerConfig(path)
  const systemPrompt = buildSystemPrompt(EVALUATION_FRAMING, readConfigFile(join(promptsDir(process.env), 'evaluate.md')))
  const env = envPath(process.env)
  const jobApp = createJobAppClient({ ...loadJobAppEnv(env), envPath: env })
  requirePassedCheck(CLAUDE_BIN, stateDir(process.env))
  const step = { claudeBin: CLAUDE_BIN, prompt: EVALUATION_PROMPT, systemPrompt, schema: EVALUATION_SCHEMA }
  const runStep = (input: string) =>
    runSandboxed({ ...step, input, timeoutMs: config.evaluation.timeoutMs, env: process.env })
  const checkHealth = () => checkOllama(profileConfig)
  printReport(await runEvaluation({ jobApp, config, checkHealth, evaluate: (ad) => evaluateAd(ad, runStep) }))
})
