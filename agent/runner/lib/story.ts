import { emailsRead } from './collectRun.ts'
import { counted } from './counted.ts'
import type { DailyReport } from './dailyRun.ts'
import type { EvaluationReport, KeptAd } from './evaluationRun.ts'
import type { AdSummary } from './jobApp.ts'
import { oneLine } from './oneLine.ts'
import type { PrescreenReport } from './prescreenRun.ts'
import type { SourceFailure } from './state.ts'
import type { FailedAttempt } from './stepFailure.ts'

// What the run did, in the sentences the run output and the email share.
export interface Story {
  opening: string[]
  // One sentence per thing that needs the user; empty when nothing does.
  problems: string[]
  promising: AdSummary[]
  setAside: AdSummary[]
  kept: KeptAd[]
}

const STEP_LABELS: Record<string, string> = {
  collect: 'Reading the alert emails',
  'expire hand-overs': 'Expiring old hand-overs',
  sync: 'Profile sync',
  'pre-screen': 'Pre-screening',
  fetch: 'Fetching ads',
  evaluate: 'Evaluation',
  'API spend': 'Spend check',
  news: 'Listing failed ads and source problems',
  summary: 'Sending the summary',
}

export function adLink(appUrl: string, id: number): string {
  return new URL(`#ad-${id}`, appUrl).href
}

// An alert may name no company; the title alone then.
export function adName({ title, company }: AdSummary): string {
  return company ? `${title}, ${company}` : title
}

function waiting(n: number, noun: string): string[] {
  if (n === 0) return []
  return [`${counted(n, noun)} ${n === 1 ? 'waits' : 'wait'} for the next run.`]
}

function prescreenSentences({ promising, setAside, failed, queued }: PrescreenReport): string[] {
  const screened = promising.length + setAside.length
  const queue = waiting(queued, 'more job title')
  if (screened > 0) {
    const found = `Pre-screening found ${counted(promising.length, 'interesting job title')} and set aside ${setAside.length}.`
    return [found, ...queue]
  }
  if (failed + queued === 0) return ['No new job titles to pre-screen.']
  return queue
}

function evaluationSentences({ evaluated, kept, queued }: EvaluationReport): string[] {
  const decided = evaluated.suitable + evaluated.unsuitable
  const keptSentence = decided > 0 ? [`Evaluation kept ${kept.length} of ${decided}.`] : []
  return [...keptSentence, ...waiting(queued, 'more ad')]
}

function openingOf(report: DailyReport): string[] {
  const { collect, prescreen, evaluation, sandbox } = report
  return [
    ...(collect ? [`Read ${counted(emailsRead(collect), 'new email')}.`] : []),
    ...(prescreen ? prescreenSentences(prescreen) : []),
    ...(evaluation ? evaluationSentences(evaluation) : []),
    ...(sandbox?.reverified ? [`Sandbox re-verified for claude ${sandbox.version}.`] : []),
  ]
}

function retrySentence(step: string, n: number): string[] {
  if (n === 0) return []
  return [`${step} could not finish ${counted(n, 'ad')}; ${n === 1 ? 'it' : 'they'} will be tried again next run.`]
}

// An ad that failed in an earlier run has no attempt here, so only its category.
function failedAdSentence(ad: AdSummary, attempts: FailedAttempt[], appUrl: string): string {
  const detail = attempts.find((attempt) => attempt.adId === ad.id && attempt.detail)?.detail
  const cause = detail ? `${ad.lastError} — ${detail}` : ad.lastError
  return `${adName(ad)} failed three times (${cause}). Retry or dismiss it in job-app: ${adLink(appUrl, ad.id)}`
}

function sourceSentence({ source, date, kind }: SourceFailure): string {
  const name = source.charAt(0).toUpperCase() + source.slice(1)
  if (kind === 'empty_alert') return `${name}'s alert of ${date} had no ads in it — check whether its format changed.`
  return `${name} blocked fetching on ${date}; fetching resumes the next day.`
}

function stepProblems(report: DailyReport): string[] {
  const { skipped, stopped, failures } = report
  return [
    ...failures.map(({ step, message }) => `${STEP_LABELS[step]} failed: ${message}`),
    ...(skipped ? [`Pre-screening and evaluation were skipped: ${skipped.message}`] : []),
    ...(stopped ? [`Stopped before the remaining model steps: ${stopped.message}`] : []),
  ]
}

function retryProblems({ prescreen, evaluation }: DailyReport): string[] {
  return [
    ...retrySentence('Pre-screening', prescreen?.failed ?? 0),
    ...retrySentence('Evaluation', evaluation?.evaluated.retrying ?? 0),
  ]
}

function newsProblems({ prescreen, evaluation, news }: DailyReport, appUrl: string): string[] {
  if (!news) return []
  const attempts = [...(prescreen?.failedAttempts ?? []), ...(evaluation?.failedAttempts ?? [])]
  return [
    ...news.failedAds.map((ad) => failedAdSentence(ad, attempts, appUrl)),
    ...news.sourceFailures.map(sourceSentence),
  ]
}

function problemsOf(report: DailyReport, appUrl: string): string[] {
  return [...stepProblems(report), ...retryProblems(report), ...newsProblems(report, appUrl)].map(oneLine)
}

export function storyOf(report: DailyReport, appUrl: string): Story {
  return {
    opening: openingOf(report),
    problems: problemsOf(report, appUrl),
    promising: report.prescreen?.promising ?? [],
    setAside: report.prescreen?.setAside ?? [],
    kept: report.evaluation?.kept ?? [],
  }
}

export function storyLines(story: Story): string[] {
  return [...story.opening, ...story.problems]
}

export function hasNews({ problems, promising, setAside, kept }: Story): boolean {
  return problems.length + promising.length + setAside.length + kept.length > 0
}
