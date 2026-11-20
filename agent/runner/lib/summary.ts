import type { AdSummary } from './jobApp.ts'
import type { SourceFailure } from './state.ts'

export interface Problem {
  step: string
  message: string
}

export interface SummaryInput {
  // The unreported drafted, title_rejected and failed ads.
  ads: AdSummary[]
  sourceFailures: SourceFailure[]
  problems: Problem[]
  appUrl: string
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

function bodyOf({ ads, sourceFailures, problems, appUrl }: SummaryInput): string {
  return [
    ...section('Drafts', inState(ads, 'drafted').map((ad) => `${ad.title}, ${ad.company} (application ${ad.applicationId})`)),
    ...section(
      'Title rejected',
      inState(ads, 'title_rejected').map((ad) => `${ad.title}, ${ad.company}, ${ad.source}: ${ad.url}`),
    ),
    ...section('Failed', inState(ads, 'failed').map((ad) => `${ad.title}, ${ad.source}: ${ad.lastError}`)),
    ...section('Source failures', sourceFailures.map(({ source, date, kind }) => `${source} ${date} ${kind}`)),
    ...section('Problems', problems.map(({ step, message }) => `${step}: ${message}`)),
    `Open job-app: ${appUrl}`,
    '',
  ].join('\n')
}

export function isEmpty({ ads, sourceFailures, problems }: Pick<SummaryInput, 'ads' | 'sourceFailures' | 'problems'>): boolean {
  return ads.length + sourceFailures.length + problems.length === 0
}

export function composeSummary(input: SummaryInput): Summary {
  return { subject: subjectOf(input), text: bodyOf(input) }
}
