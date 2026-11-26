import { CliError } from '../../lib/cliError.ts'
import { UNLIMITED } from './apiBudget.ts'
import type { ApiSpend, StepBudget } from './apiBudget.ts'
import type { HealthResult } from '../../profile/lib/ollama.ts'
import { runCollect } from './collectRun.ts'
import type { CollectReport, CollectRunOptions } from './collectRun.ts'
import { runDrafting } from './draftRun.ts'
import type { DraftReport, DraftRunOptions } from './draftRun.ts'
import { runEvaluation } from './evaluationRun.ts'
import type { EvaluationReport, EvaluationRunOptions } from './evaluationRun.ts'
import { runHandoverFetch } from './handoverFetchRun.ts'
import type { HandoverFetchOptions, HandoverFetchReport } from './handoverFetchRun.ts'
import { dismissExpiredHandovers } from './handoverExpiry.ts'
import type { JobAppClient } from './jobApp.ts'
import type { Mailbox } from './mailbox.ts'
import { runPrescreen } from './prescreenRun.ts'
import type { PrescreenReport, PrescreenRunOptions } from './prescreenRun.ts'
import type { MailMessage } from './smtp.ts'
import type { RunnerState } from './state.ts'
import { composeSummary, isEmpty, prescreenTally } from './summary.ts'
import type { Problem } from './summary.ts'
import { syncProfile } from './sync.ts'
import type { SyncOptions, SyncResult } from './sync.ts'

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
  handoverFetch: Omit<HandoverFetchOptions, 'jobApp' | 'state'>
  evaluation: Omit<EvaluationRunOptions, 'jobApp' | 'checkHealth'>
  drafting: Omit<DraftRunOptions, 'jobApp' | 'checkHealth'>
  summary: { recipient: string; alwaysSend: boolean; appUrl: string; lanUrl?: string }
  send: (message: MailMessage) => Promise<void>
  now: () => Date
}

// A step left null did not run or did not finish.
export interface DailyReport {
  collect: CollectReport | null
  dismissed: number | null
  sandbox: { version: string; reverified: boolean } | null
  sync: SyncResult | null
  prescreen: PrescreenReport | null
  handoverFetch: HandoverFetchReport | null
  evaluation: EvaluationReport | null
  drafting: DraftReport | null
  // Why the model steps (sync to drafting) were skipped: reported,
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

const REPORTED_STATES = ['drafted', 'title_rejected', 'failed']

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
  // Here rather than in collect: text is fetched only in a run that can
  // evaluate it the same day.
  const fetchOptions = { ...options.handoverFetch, jobApp, state }
  report.handoverFetch = await guarded(run, 'hand-over fetch', () => runHandoverFetch(fetchOptions))
  const steps = { jobApp, checkHealth: async () => health, canStart }
  report.evaluation = await guarded(run, 'evaluate', () => runEvaluation({ ...options.evaluation, ...steps }))
  report.drafting = await guarded(run, 'draft', () => runDrafting({ ...options.drafting, ...steps }))
  // Guarded too: the budget reads the spend ledger, which may be invalid.
  await guarded(run, 'API spend', async () => {
    const reason = budget.stopReason()
    if (reason) report.stopped = { step: 'model steps', message: reason }
    report.apiSpend = budget.spend()
  })
}

// Nothing is marked reported, and no source failure cleared, until the mail
// server has accepted the message.
async function sendSummary({ options, report }: Run): Promise<void> {
  const { jobApp, state } = options
  const listed = await Promise.all(REPORTED_STATES.map((adState) => jobApp.listAds(adState)))
  const ads = listed.flat().filter((ad) => ad.reportedAt === null)
  const prescreened = report.prescreen?.ads ?? []
  const sourceFailures = state.readFailures()
  const notices = [report.skipped, report.stopped].filter((problem) => problem !== null)
  const problems = [...notices, ...report.failures]
  if (isEmpty({ ads, prescreened, sourceFailures, problems }) && !options.summary.alwaysSend) return
  const { appUrl, lanUrl } = options.summary
  const tally = prescreenTally(await jobApp.listAllAds(), options.now())
  const { apiSpend } = report
  // Pre-screen failures never move an ad to failed, so they have no line to join.
  const failedAttempts = [...(report.evaluation?.failedAttempts ?? []), ...(report.drafting?.failedAttempts ?? [])]
  const summary = composeSummary({ ads, prescreened, tally, sourceFailures, problems, failedAttempts, apiSpend, appUrl, lanUrl })
  await options.send({ to: options.summary.recipient, ...summary, date: options.now() })
  report.sent = true
  await jobApp.markReported(ads.map((ad) => ad.id))
  state.removeFailures(sourceFailures)
}

export async function runDaily(options: DailyRunOptions): Promise<DailyReport> {
  const report: DailyReport = {
    collect: null,
    dismissed: null,
    sandbox: null,
    sync: null,
    prescreen: null,
    handoverFetch: null,
    evaluation: null,
    drafting: null,
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
  await guarded(run, 'summary', () => sendSummary(run))
  return report
}
