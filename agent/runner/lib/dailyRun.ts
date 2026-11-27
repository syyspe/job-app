import { CliError } from '../../lib/cliError.ts'
import { UNLIMITED } from './apiBudget.ts'
import type { ApiSpend, StepBudget } from './apiBudget.ts'
import type { HealthResult } from '../../profile/lib/ollama.ts'
import { runCollect } from './collectRun.ts'
import type { CollectReport, CollectRunOptions } from './collectRun.ts'
import { runEvaluation } from './evaluationRun.ts'
import type { EvaluationReport, EvaluationRunOptions } from './evaluationRun.ts'
import { runFetch } from './fetchRun.ts'
import type { FetchOptions, FetchReport } from './fetchRun.ts'
import { dismissExpiredHandovers } from './handoverExpiry.ts'
import type { AdSummary, JobAppClient } from './jobApp.ts'
import type { Mailbox } from './mailbox.ts'
import { runPrescreen } from './prescreenRun.ts'
import type { PrescreenReport, PrescreenRunOptions } from './prescreenRun.ts'
import type { MailMessage } from './smtp.ts'
import type { RunnerState, SourceFailure } from './state.ts'
import { hasNews, storyOf } from './story.ts'
import { composeSummary } from './summary.ts'
import { syncProfile } from './sync.ts'
import type { SyncOptions, SyncResult } from './sync.ts'

export interface Problem {
  step: string
  message: string
}

export interface DailyRunOptions {
  jobApp: JobAppClient
  state: RunnerState
  openMailbox: () => Promise<Mailbox>
  collect: Omit<CollectRunOptions, 'mailbox' | 'jobApp' | 'state'>
  handoverWaitDays: number
  checkHealth: () => Promise<HealthResult>
  // Throws CliError when the sandbox can't be verified for the installed CLI;
  // null under engine "api", which needs no sandbox.
  gate: () => Promise<{ version: string; reverified: boolean } | null>
  // Asked before each model step starts; unlimited when left out.
  budget?: StepBudget
  // Null when config has no syncFolder.
  sync: Omit<SyncOptions, 'jobApp'> | null
  prescreen: Omit<PrescreenRunOptions, 'jobApp'>
  fetch: Omit<FetchOptions, 'jobApp' | 'state'>
  evaluation: Omit<EvaluationRunOptions, 'jobApp' | 'checkHealth'>
  summary: { recipient: string; alwaysSend: boolean; appUrl: string; lanUrl?: string }
  send: (message: MailMessage) => Promise<void>
  now: () => Date
}

// What the summary reports beyond this run's own steps: the unreported failed
// ads and the source failures recorded since the last summary.
export interface News {
  failedAds: AdSummary[]
  sourceFailures: SourceFailure[]
}

// A step left null did not run or did not finish.
export interface DailyReport {
  collect: CollectReport | null
  dismissed: number | null
  sandbox: { version: string; reverified: boolean } | null
  sync: SyncResult | null
  prescreen: PrescreenReport | null
  fetch: FetchReport | null
  evaluation: EvaluationReport | null
  news: News | null
  // Why the model steps (sync to evaluation) were skipped: reported,
  // but not a failure of the run.
  skipped: Problem | null
  // Why the budget stopped new model steps part-way: reported like a skip.
  stopped: Problem | null
  // What the Claude API cost, whenever the run made an API call.
  apiSpend: ApiSpend | null
  // Steps that failed with a CliError; any of them fails the run.
  failures: Problem[]
  sent: boolean
}

interface Run {
  options: DailyRunOptions
  report: DailyReport
}

// One step failing the user can act on doesn't stop the others; any other
// error is our fault and ends the run.
async function guarded<T>(run: Run, step: string, work: () => Promise<T>): Promise<T | null> {
  try {
    return await work()
  } catch (err) {
    if (!(err instanceof CliError)) throw err
    run.report.failures.push({ step, message: err.message })
    return null
  }
}

async function collect({ options }: Run): Promise<CollectReport> {
  const mailbox = await options.openMailbox()
  try {
    return await runCollect({ ...options.collect, mailbox, jobApp: options.jobApp, state: options.state })
  } finally {
    await mailbox.close()
  }
}

// The gate's own failure is a skip, like Ollama being down: no ad is touched.
async function passGate(run: Run): Promise<boolean> {
  try {
    run.report.sandbox = await run.options.gate()
    return true
  } catch (err) {
    if (!(err instanceof CliError)) throw err
    run.report.skipped = { step: 'model steps', message: err.message }
    return false
  }
}

async function modelSteps(run: Run): Promise<void> {
  const { options, report } = run
  const health = await options.checkHealth()
  if (!health.ok) {
    report.skipped = { step: 'model steps', message: `Ollama health check failed: ${health.reason}` }
    return
  }
  if (!(await passGate(run))) return
  const { jobApp, sync, state } = options
  const budget = options.budget ?? UNLIMITED
  const canStart = () => budget.canStart()
  if (sync) report.sync = await guarded(run, 'sync', () => syncProfile({ ...sync, jobApp }))
  report.prescreen = await guarded(run, 'pre-screen', () => runPrescreen({ ...options.prescreen, jobApp, canStart }))
  // After the pre-screen, whose verdict picks what to fetch, and only in a run
  // that can evaluate the text the same day.
  const fetchOptions = { ...options.fetch, jobApp, state }
  report.fetch = await guarded(run, 'fetch', () => runFetch(fetchOptions))
  const steps = { jobApp, checkHealth: async () => health, canStart }
  report.evaluation = await guarded(run, 'evaluate', () => runEvaluation({ ...options.evaluation, ...steps }))
  // Guarded too: the budget reads the spend ledger, which may be invalid.
  await guarded(run, 'API spend', async () => {
    const reason = budget.stopReason()
    if (reason) report.stopped = { step: 'model steps', message: reason }
    report.apiSpend = budget.spend()
  })
}

async function gatherNews({ options }: Run): Promise<News> {
  const failed = await options.jobApp.listAds('failed')
  return { failedAds: failed.filter((ad) => ad.reportedAt === null), sourceFailures: options.state.readFailures() }
}

// Nothing is marked reported, and no source failure cleared, until the mail
// server has accepted the message.
async function sendSummary({ options, report }: Run): Promise<void> {
  const { appUrl, lanUrl, recipient, alwaysSend } = options.summary
  const story = storyOf(report, appUrl)
  if (!hasNews(story) && !alwaysSend) return
  const summary = composeSummary({ story, apiSpend: report.apiSpend, appUrl, lanUrl })
  await options.send({ to: recipient, ...summary, date: options.now() })
  report.sent = true
  if (!report.news) return
  await options.jobApp.markReported(report.news.failedAds.map((ad) => ad.id))
  options.state.removeFailures(report.news.sourceFailures)
}

export async function runDaily(options: DailyRunOptions): Promise<DailyReport> {
  const report: DailyReport = {
    collect: null,
    dismissed: null,
    sandbox: null,
    sync: null,
    prescreen: null,
    fetch: null,
    evaluation: null,
    news: null,
    skipped: null,
    stopped: null,
    apiSpend: null,
    failures: [],
    sent: false,
  }
  const run: Run = { options, report }
  report.collect = await guarded(run, 'collect', () => collect(run))
  const expiry = { waitDays: options.handoverWaitDays, now: options.now() }
  report.dismissed = await guarded(run, 'expire hand-overs', () => dismissExpiredHandovers(options.jobApp, expiry))
  await modelSteps(run)
  report.news = await guarded(run, 'news', () => gatherNews(run))
  await guarded(run, 'summary', () => sendSummary(run))
  return report
}
