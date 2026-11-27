// npm run agent:run — the daily run: collect, expire hand-overs, sync the
// profile, pre-screen every source's new ads, fetch the promising ones,
// evaluate, and email one summary when there is news, or every run with
// summary.alwaysSend. It never drafts. Task Scheduler starts it through
// daily-run.sh.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { runCommand } from '../../lib/cliError.ts'
import { configPath, envPath, indexPath, promptsDir, stateDir } from '../../lib/paths.ts'
import type { Env } from '../../lib/paths.ts'
import { loadProfileConfig, readConfigFile } from '../../profile/lib/config.ts'
import { checkOllama, createOllama } from '../../profile/lib/ollama.ts'
import { openIndex } from '../../profile/lib/store.ts'
import type { IndexStore } from '../../profile/lib/store.ts'
import { runDaily } from '../lib/dailyRun.ts'
import type { DailyReport, DailyRunOptions } from '../lib/dailyRun.ts'
import { loadEngine } from '../lib/engine.ts'
import { loadJobAppEnv, loadMailEnv, loadSmtpEnv } from '../lib/env.ts'
import { EVALUATION_FRAMING, EVALUATION_PROMPT, EVALUATION_SCHEMA, evaluateAd } from '../lib/evaluate.ts'
import { createJobAppClient } from '../lib/jobApp.ts'
import { acquireRunLock } from '../lib/lock.ts'
import { openMailbox } from '../lib/mailbox.ts'
import { createPoliteHttp } from '../lib/politeHttp.ts'
import { PRESCREEN_FRAMING, PRESCREEN_PROMPT, PRESCREEN_SCHEMA, prescreenAd } from '../lib/prescreen.ts'
import { buildSystemPrompt } from '../lib/prompts.ts'
import { loadDailyRunConfig, loadRunnerConfig, loadSourcesConfig } from '../lib/runnerConfig.ts'
import { ensureSandboxVerified } from '../lib/sandboxCheck.ts'
import { runOutputLines } from '../lib/runOutput.ts'
import { runProbes } from '../lib/sandboxProbes.ts'
import { sendMail } from '../lib/smtp.ts'
import { CONNECTORS } from '../lib/sources/index.ts'
import type { SourceConnector } from '../lib/sources/types.ts'
import { createRunnerState, localDate } from '../lib/state.ts'

const CLAUDE_BIN = 'claude'

// Everything read from config, prompts and env, before the lock is taken.
function loadSetup(env: Env) {
  const path = configPath(env)
  const prompts = promptsDir(env)
  const envFile = envPath(env)
  const profile = loadProfileConfig(path)
  return {
    profile,
    engine: loadEngine(env, profile),
    runner: loadRunnerConfig(path),
    sources: loadSourcesConfig(path, CONNECTORS),
    daily: loadDailyRunConfig(path),
    prescreenPrompt: buildSystemPrompt(PRESCREEN_FRAMING, readConfigFile(join(prompts, 'prescreen.md'))),
    evaluatePrompt: buildSystemPrompt(EVALUATION_FRAMING, readConfigFile(join(prompts, 'evaluate.md'))),
    envFile,
    jobAppEnv: loadJobAppEnv(envFile),
    mail: loadMailEnv(envFile),
    smtp: loadSmtpEnv(envFile),
    stateDir: stateDir(env),
  }
}

type Setup = ReturnType<typeof loadSetup>

function fetchOptions(setup: Setup, today: string): DailyRunOptions['fetch'] {
  const counters = createRunnerState(setup.stateDir).counters(today)
  const httpFor = (connector: SourceConnector) => {
    const { dailyOpenCap, minDelayMs } = setup.sources[connector.id]
    const hosts = connector.fetchHosts ?? []
    return createPoliteHttp({ sourceId: connector.id, hosts, dailyOpenCap, minDelayMs, counters, fetch, now: Date.now, sleep })
  }
  return { connectors: CONNECTORS, sources: setup.sources, today, httpFor }
}

function prescreenOptions(setup: Setup): DailyRunOptions['prescreen'] {
  const runStep = setup.engine.stepFor({
    step: 'prescreen',
    prompt: PRESCREEN_PROMPT,
    systemPrompt: setup.prescreenPrompt,
    schema: PRESCREEN_SCHEMA,
    timeoutMs: setup.runner.prescreen.timeoutMs,
  })
  return { config: setup.runner.prescreen, prescreen: (ad) => prescreenAd(ad, runStep) }
}

// Under "api" no sandbox is involved, so there is nothing to verify.
function gate(setup: Setup): DailyRunOptions['gate'] {
  if (setup.engine.kind === 'api') return async () => null
  const probes = () => runProbes({ claudeBin: CLAUDE_BIN, env: process.env, timeoutMs: 180000 })
  return () => ensureSandboxVerified({ claudeBin: CLAUDE_BIN, stateDir: setup.stateDir, runProbes: probes, now: () => new Date() })
}

function modelOptions(setup: Setup): Pick<DailyRunOptions, 'evaluation' | 'gate' | 'budget'> {
  const { engine } = setup
  const evaluate = { prompt: EVALUATION_PROMPT, systemPrompt: setup.evaluatePrompt, schema: EVALUATION_SCHEMA }
  const runEvaluateStep = engine.stepFor({ step: 'evaluation', ...evaluate, timeoutMs: setup.runner.evaluation.timeoutMs })
  return {
    evaluation: { config: setup.runner, evaluate: (ad) => evaluateAd(ad, runEvaluateStep) },
    gate: gate(setup),
    budget: engine.budget,
  }
}

function dailyOptions(setup: Setup, store: IndexStore | null): DailyRunOptions {
  const today = localDate(new Date())
  const { profile, envFile } = setup
  const syncFolder = profile.syncFolder
  const ollama = createOllama({ url: profile.ollamaUrl, model: profile.embeddingModel })
  return {
    jobApp: createJobAppClient({ ...setup.jobAppEnv, envPath: envFile }),
    state: createRunnerState(setup.stateDir),
    openMailbox: () => openMailbox({ ...setup.mail, envPath: envFile }),
    collect: { connectors: CONNECTORS, sources: setup.sources, today, titleRules: setup.runner.titleRules.reject },
    fetch: fetchOptions(setup, today),
    prescreen: prescreenOptions(setup),
    handoverWaitDays: setup.daily.handoverWaitDays,
    checkHealth: () => checkOllama(profile),
    sync: syncFolder && store ? { config: { ...profile, syncFolder }, store, ollama } : null,
    ...modelOptions(setup),
    summary: {
      recipient: setup.daily.summary.recipient,
      alwaysSend: setup.daily.summary.alwaysSend,
      appUrl: setup.jobAppEnv.baseUrl,
      lanUrl: setup.daily.summary.lanUrl,
    },
    send: (message) => sendMail(message, { ...setup.smtp, envPath: envFile }),
    now: () => new Date(),
  }
}

function printReport(report: DailyReport, appUrl: string): void {
  for (const line of runOutputLines(report, appUrl)) console.log(line)
  for (const { step, message } of report.failures) console.error(`${step} failed: ${message}`)
}

// The index is opened only when there is a syncFolder to sync into it.
function openSyncIndex(setup: Setup): IndexStore | null {
  if (!setup.profile.syncFolder) return null
  mkdirSync(setup.profile.syncFolder, { recursive: true })
  return openIndex(indexPath(process.env))
}

await runCommand(async () => {
  const setup = loadSetup(process.env)
  const release = acquireRunLock(setup.stateDir)
  let store: IndexStore | null = null
  try {
    store = openSyncIndex(setup)
    const report = await runDaily(dailyOptions(setup, store))
    printReport(report, setup.jobAppEnv.baseUrl)
    if (report.failures.length > 0) process.exitCode = 1
  } finally {
    store?.close()
    release()
  }
})
