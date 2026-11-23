import type { AdSummary } from './jobApp.ts'
import type { SourceFailure } from './state.ts'

export interface Problem {
  step: string
  message: string
}

// Hand-over ads pre-screened in the last 14 days, by verdict, and how many of
// each the user clicked Fetch on.
export interface PrescreenTally {
  promising: { total: number; fetched: number }
  notPromising: { total: number; fetched: number }
}

export interface SummaryInput {
  // The unreported drafted, title_rejected and failed ads.
  ads: AdSummary[]
  // The ads this run pre-screened.
  prescreened: AdSummary[]
  tally: PrescreenTally
  sourceFailures: SourceFailure[]
  problems: Problem[]
  appUrl: string
  lanUrl?: string
}

export interface Summary {
  subject: string
  text: string
}

// Ad text is untrusted: control characters and line breaks become spaces, so
// a field can never start a line of its own.
function clean(value: string): string {
  return value.replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ')
}

function counted(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

function section(heading: string, lines: string[]): string[] {
  if (lines.length === 0) return []
  return [`${heading} (${lines.length})`, ...lines.map((line) => `- ${clean(line)}`), '']
}

function inState(ads: AdSummary[], state: string): AdSummary[] {
  return ads.filter((ad) => ad.state === state)
}

const TALLY_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000
const VERDICT_LABELS = { promising: 'promising', not_promising: 'not promising' }

// firstSeenAt is SQLite's UTC 'YYYY-MM-DD HH:MM:SS', so it compares as text.
function sqliteTime(time: number): string {
  return new Date(time).toISOString().slice(0, 19).replace('T', ' ')
}

export function prescreenTally(ads: AdSummary[], now: Date): PrescreenTally {
  const since = sqliteTime(now.getTime() - TALLY_DAYS * DAY_MS)
  const recent = ads.filter((ad) => ad.sourceMode === 'handover' && ad.prescreen && ad.firstSeenAt >= since)
  const count = (verdict: string) => {
    const matching = recent.filter((ad) => ad.prescreen?.verdict === verdict)
    return { total: matching.length, fetched: matching.filter((ad) => ad.fetchRequestedAt !== null).length }
  }
  return { promising: count('promising'), notPromising: count('not_promising') }
}

function prescreenLine({ title, company, prescreen }: AdSummary): string {
  const verdict = prescreen ? VERDICT_LABELS[prescreen.verdict] : ''
  return `${title}, ${company}: ${verdict} — ${prescreen?.reason ?? ''}`
}

function tallyLines({ promising, notPromising }: PrescreenTally): string[] {
  if (promising.total + notPromising.total === 0) return []
  const counts = `promising ${promising.total} (fetched ${promising.fetched}), not promising ${notPromising.total} (fetched ${notPromising.fetched})`
  return [`Pre-screen vs. Fetch, last ${TALLY_DAYS} days: ${counts}`, '']
}

function subjectOf(input: SummaryInput): string {
  const { ads, sourceFailures, problems } = input
  return [
    `job agent: ${counted(inState(ads, 'drafted').length, 'draft')}`,
    `${inState(ads, 'title_rejected').length} title rejected`,
    `${inState(ads, 'failed').length} failed`,
    counted(sourceFailures.length, 'source failure'),
    counted(problems.length, 'problem'),
  ].join(', ')
}

function bodyOf({ ads, prescreened, tally, sourceFailures, problems, appUrl, lanUrl }: SummaryInput): string {
  return [
    ...section('Drafts', inState(ads, 'drafted').map((ad) => `${ad.title}, ${ad.company} (application ${ad.applicationId})`)),
    ...section('Pre-screened', prescreened.map(prescreenLine)),
    ...tallyLines(tally),
    ...section(
      'Title rejected',
      inState(ads, 'title_rejected').map((ad) => `${ad.title}, ${ad.company}, ${ad.source}: ${ad.url}`),
    ),
    ...section('Failed', inState(ads, 'failed').map((ad) => `${ad.title}, ${ad.source}: ${ad.lastError}`)),
    ...section('Source failures', sourceFailures.map(({ source, date, kind }) => `${source} ${date} ${kind}`)),
    ...section('Problems', problems.map(({ step, message }) => `${step}: ${message}`)),
    `Open job-app: ${appUrl}`,
    ...(lanUrl ? [`Open job-app (LAN): ${lanUrl}`] : []),
    '',
  ].join('\n')
}

type Reported = Pick<SummaryInput, 'ads' | 'prescreened' | 'sourceFailures' | 'problems'>

export function isEmpty({ ads, prescreened, sourceFailures, problems }: Reported): boolean {
  return ads.length + prescreened.length + sourceFailures.length + problems.length === 0
}

export function composeSummary(input: SummaryInput): Summary {
  return { subject: subjectOf(input), text: bodyOf(input) }
}
