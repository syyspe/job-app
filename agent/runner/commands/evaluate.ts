// npm run agent:evaluate — screens new ads by title, then evaluates the
// oldest ready ads, each in its own step on the configured engine.
import { join } from 'node:path'
import { runCommand } from '../../lib/cliError.ts'
import { configPath, envPath, promptsDir, stateDir } from '../../lib/paths.ts'
import { loadProfileConfig, readConfigFile } from '../../profile/lib/config.ts'
import { checkOllama } from '../../profile/lib/ollama.ts'
import { loadEngine } from '../lib/engine.ts'
import { loadJobAppEnv } from '../lib/env.ts'
import { EVALUATION_FRAMING, EVALUATION_PROMPT, EVALUATION_SCHEMA, evaluateAd } from '../lib/evaluate.ts'
import { formatEvaluationReport, runEvaluation } from '../lib/evaluationRun.ts'
import { createJobAppClient } from '../lib/jobApp.ts'
import { buildSystemPrompt } from '../lib/prompts.ts'
import { loadRunnerConfig } from '../lib/runnerConfig.ts'
import { requirePassedCheck } from '../lib/sandboxCheck.ts'

await runCommand(async () => {
  const path = configPath(process.env)
  const profileConfig = loadProfileConfig(path)
  const config = loadRunnerConfig(path)
  const engine = loadEngine(process.env, profileConfig)
  const systemPrompt = buildSystemPrompt(EVALUATION_FRAMING, readConfigFile(join(promptsDir(process.env), 'evaluate.md')))
  const env = envPath(process.env)
  const jobApp = createJobAppClient({ ...loadJobAppEnv(env), envPath: env })
  if (engine.kind === 'cli') requirePassedCheck('claude', stateDir(process.env))
  const step = { prompt: EVALUATION_PROMPT, systemPrompt, schema: EVALUATION_SCHEMA }
  const runStep = engine.stepFor({ step: 'evaluation', ...step, timeoutMs: config.evaluation.timeoutMs })
  const checkHealth = () => checkOllama(profileConfig)
  const canStart = () => engine.budget.canStart()
  const report = await runEvaluation({ jobApp, config, checkHealth, canStart, evaluate: (ad) => evaluateAd(ad, runStep) })
  for (const line of formatEvaluationReport(report)) console.log(line)
  const stopped = engine.budget.stopReason()
  if (stopped) console.log(`stopped: ${stopped}`)
})
