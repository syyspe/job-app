import { CliError } from '../../lib/cliError.ts'
import type { HealthResult } from '../../profile/lib/ollama.ts'
import { runCollect } from './collectRun.ts'
import type { CollectReport, CollectRunOptions } from './collectRun.ts'
import { runDrafting } from './draftRun.ts'
import type { DraftReport, DraftRunOptions } from './draftRun.ts'
import { runEvaluation } from './evaluationRun.ts'
import type { EvaluationReport, EvaluationRunOptions } from './evaluationRun.ts'
import { dismissExpiredHandovers } from './handoverExpiry.ts'
import type { JobAppClient } from './jobApp.ts'
import type { Mailbox } from './mailbox.ts'
import type { MailMessage } from './smtp.ts'
import type { RunnerState } from './state.ts'
import { composeSummary } from './summary.ts'
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
  // Throws CliError when the sandbox can't be verified for the installed CLI.
  gate: () => Promise<{ version: string; reverified: boolean }>
  // Null when config has no syncFolder.
  sync: Omit<SyncOptions, 'jobApp'> | null
  evaluation: Omit<EvaluationRunOptions, 'jobApp' | 'checkHealth'>
  drafting: Omit<DraftRunOptions, 'jobApp' | 'checkHealth'>
  summary: { recipient: string; appUrl: string }
  send: (message: MailMessage) => Promise<void>
  now: () => Date
}

// A step left null did not run or did not finish.
export interface DailyReport {
  collect: CollectReport | null
  dismissed: number | null
  sandbox: { version: string; reverified: boolean } | null
  sync: SyncResult | null
  evaluation: EvaluationReport | null
  drafting: DraftReport | null
  // Why the model steps (sync, evaluation, drafting) were skipped: reported,
  // but not a failure of the run.
  skipped: Problem | null
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
  const { jobApp, sync } = options
  if (sync) report.sync = await guarded(run, 'sync', () => syncProfile({ ...sync, jobApp }))
  const checkHealth = async () => health
  report.evaluation = await guarded(run, 'evaluate', () => runEvaluation({ ...options.evaluation, jobApp, checkHealth }))
  report.drafting = await guarded(run, 'draft', () => runDrafting({ ...options.drafting, jobApp, checkHealth }))
}

// Nothing is marked reported, and no source failure cleared, until the mail
// server has accepted the message.
async function sendSummary({ options, report }: Run): Promise<void> {
  const { jobApp, state } = options
  const listed = await Promise.all(REPORTED_STATES.map((adState) => jobApp.listAds(adState)))
  const ads = listed.flat().filter((ad) => ad.reportedAt === null)
  const sourceFailures = state.readFailures()
  const problems = [...(report.skipped ? [report.skipped] : []), ...report.failures]
  const summary = composeSummary({ ads, sourceFailures, problems, appUrl: options.summary.appUrl })
  if (!summary) return
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
    evaluation: null,
    drafting: null,
    skipped: null,
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
