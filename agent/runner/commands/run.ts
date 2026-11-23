// npm run agent:run — the daily run: collect, expire hand-overs, sync the
// profile, evaluate, draft, and email one summary when there is news, or every
// run with summary.alwaysSend. Task Scheduler starts it through daily-run.sh.
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
import { formatCollectReport } from '../lib/collectRun.ts'
import { runDaily } from '../lib/dailyRun.ts'
import type { DailyReport, DailyRunOptions } from '../lib/dailyRun.ts'
import { DRAFT_FRAMING, DRAFT_PROMPT, DRAFT_SCHEMA, writeDraft } from '../lib/draft.ts'
import { formatDraftReport } from '../lib/draftRun.ts'
import { loadJobAppEnv, loadMailEnv, loadSmtpEnv } from '../lib/env.ts'
import { EVALUATION_FRAMING, EVALUATION_PROMPT, EVALUATION_SCHEMA, evaluateAd } from '../lib/evaluate.ts'
import { formatEvaluationReport } from '../lib/evaluationRun.ts'
import { createJobAppClient } from '../lib/jobApp.ts'
import { acquireRunLock } from '../lib/lock.ts'
import { openMailbox } from '../lib/mailbox.ts'
import { createPoliteHttp } from '../lib/politeHttp.ts'
import { buildSystemPrompt } from '../lib/prompts.ts'
import { loadDailyRunConfig, loadDraftConfig, loadRunnerConfig, loadSourcesConfig } from '../lib/runnerConfig.ts'
import { runSandboxed } from '../lib/sandbox.ts'
import { ensureSandboxVerified } from '../lib/sandboxCheck.ts'
import { runProbes } from '../lib/sandboxProbes.ts'
import { sendMail } from '../lib/smtp.ts'
import { CONNECTORS } from '../lib/sources/index.ts'
import type { SourceConnector } from '../lib/sources/types.ts'
import { createRunnerState, localDate } from '../lib/state.ts'
import { formatSyncResult } from '../lib/sync.ts'

const CLAUDE_BIN = 'claude'

// Everything read from config, prompts and env, before the lock is taken.
function loadSetup(env: Env) {
  const path = configPath(env)
  const prompts = promptsDir(env)
  const drafting = loadDraftConfig(path)
  const envFile = envPath(env)
  return {
    profile: loadProfileConfig(path),
    runner: loadRunnerConfig(path),
    drafting,
    sources: loadSourcesConfig(path, CONNECTORS),
    daily: loadDailyRunConfig(path),
    evaluatePrompt: buildSystemPrompt(EVALUATION_FRAMING, readConfigFile(join(prompts, 'evaluate.md'))),
    draftPrompt: buildSystemPrompt(DRAFT_FRAMING, readConfigFile(join(prompts, 'draft.md'))),
    cvTemplates: { fi: readConfigFile(drafting.cvTemplates.fi), en: readConfigFile(drafting.cvTemplates.en) },
    envFile,
    jobAppEnv: loadJobAppEnv(envFile),
    mail: loadMailEnv(envFile),
    smtp: loadSmtpEnv(envFile),
    stateDir: stateDir(env),
  }
}

type Setup = ReturnType<typeof loadSetup>

function collectOptions(setup: Setup, today: string): DailyRunOptions['collect'] {
  const counters = createRunnerState(setup.stateDir).counters(today)
  const httpFor = (connector: SourceConnector) => {
    const { dailyOpenCap, minDelayMs } = setup.sources[connector.id]
    const hosts = connector.fetchHosts ?? []
    return createPoliteHttp({ sourceId: connector.id, hosts, dailyOpenCap, minDelayMs, counters, fetch, now: Date.now, sleep })
  }
  return { connectors: CONNECTORS, sources: setup.sources, titleRules: setup.runner.titleRules.reject, today, httpFor }
}

function modelOptions(setup: Setup, today: string): Pick<DailyRunOptions, 'evaluation' | 'drafting' | 'gate'> {
  const evaluateStep = { claudeBin: CLAUDE_BIN, prompt: EVALUATION_PROMPT, systemPrompt: setup.evaluatePrompt, schema: EVALUATION_SCHEMA }
  const evaluateTimeout = setup.runner.evaluation.timeoutMs
  const runEvaluateStep = (input: string) => runSandboxed({ ...evaluateStep, input, timeoutMs: evaluateTimeout, env: process.env })
  const draftStep = { claudeBin: CLAUDE_BIN, prompt: DRAFT_PROMPT, systemPrompt: setup.draftPrompt, schema: DRAFT_SCHEMA }
  const draftTimeout = setup.drafting.timeoutMs
  const runDraftStep = (input: string) => runSandboxed({ ...draftStep, input, timeoutMs: draftTimeout, env: process.env })
  const probes = () => runProbes({ claudeBin: CLAUDE_BIN, env: process.env, timeoutMs: 180000 })
  return {
    evaluation: { config: setup.runner, evaluate: (ad) => evaluateAd(ad, runEvaluateStep) },
    drafting: { config: setup.drafting, write: (ad) => writeDraft(ad, setup.cvTemplates, runDraftStep), today },
    gate: () => ensureSandboxVerified({ claudeBin: CLAUDE_BIN, stateDir: setup.stateDir, runProbes: probes, now: () => new Date() }),
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
    collect: collectOptions(setup, today),
    handoverWaitDays: setup.daily.handoverWaitDays,
    checkHealth: () => checkOllama(profile),
    sync: syncFolder && store ? { config: { ...profile, syncFolder }, store, ollama } : null,
    ...modelOptions(setup, today),
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

function summaryLine(report: DailyReport): string {
  if (report.sent) return 'summary: sent'
  if (report.failures.some((failure) => failure.step === 'summary')) return 'summary: not sent'
  return 'summary: nothing to report'
}

// Steps 1–3: collection, expiry and the model-step gate.
function earlyLines(report: DailyReport): string[] {
  return [
    ...(report.collect ? formatCollectReport(report.collect, CONNECTORS) : []),
    ...(report.dismissed === null ? [] : [`expired hand-overs: ${report.dismissed} dismissed`]),
    ...(report.sandbox?.reverified ? [`sandbox re-verified for claude ${report.sandbox.version}`] : []),
    ...(report.skipped ? [`model steps skipped: ${report.skipped.message}`] : []),
  ]
}

function modelLines(report: DailyReport): string[] {
  return [
    ...(report.sync ? formatSyncResult(report.sync) : []),
    ...(report.evaluation ? formatEvaluationReport(report.evaluation) : []),
    ...(report.drafting ? formatDraftReport(report.drafting) : []),
  ]
}

function printReport(report: DailyReport): void {
  for (const line of [...earlyLines(report), ...modelLines(report), summaryLine(report)]) console.log(line)
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
    printReport(report)
    if (report.failures.length > 0) process.exitCode = 1
  } finally {
    store?.close()
    release()
  }
})
