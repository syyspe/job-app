import type { ApiSpend } from './apiBudget.ts'
import { counted } from './counted.ts'
import type { KeptAd } from './evaluationRun.ts'
import type { AdSummary } from './jobApp.ts'
import { oneLine } from './oneLine.ts'
import { adLink, adName } from './story.ts'
import type { Story } from './story.ts'

export interface SummaryInput {
  story: Story
  // Set whenever the run made a Claude API call.
  apiSpend: ApiSpend | null
  appUrl: string
  lanUrl?: string
}

export interface Summary {
  subject: string
  text: string
}

// Blank-line separated; an empty block leaves no gap.
function block(lines: string[]): string[] {
  return lines.length === 0 ? [] : [...lines, '']
}

function keptBlock({ ad, fitSummary }: KeptAd, appUrl: string): string[] {
  return [oneLine(adName(ad)), `Ad: ${oneLine(ad.url)}`, oneLine(fitSummary), `In job-app: ${adLink(appUrl, ad.id)}`, '']
}

function setAsideLines(ads: AdSummary[]): string[] {
  if (ads.length === 0) return []
  const lines = ads.flatMap((ad) => [`- ${oneLine(`${adName(ad)} — ${ad.prescreen?.reason ?? ''}`)}`, `  Ad: ${oneLine(ad.url)}`])
  return ['Set aside by the pre-screen:', ...lines]
}

function spendLines(spend: ApiSpend | null): string[] {
  if (!spend) return []
  const { runUsd, monthUsd, monthlyUsd } = spend
  return [`Claude API: $${runUsd.toFixed(2)} this run, $${monthUsd.toFixed(2)} of $${monthlyUsd.toFixed(2)} this month.`]
}

function subjectOf({ kept, setAside, problems }: Story): string {
  const news = kept.length + setAside.length === 0 ? 'nothing new' : `${kept.length} kept, ${setAside.length} set aside`
  const trouble = problems.length === 0 ? '' : `, ${counted(problems.length, 'problem')}`
  return `job agent: ${news}${trouble}`
}

function bodyOf({ story, apiSpend, appUrl, lanUrl }: SummaryInput): string {
  return [
    ...block(story.opening.length === 0 ? [] : [story.opening.join(' ')]),
    ...story.kept.flatMap((kept) => keptBlock(kept, appUrl)),
    ...block(setAsideLines(story.setAside)),
    ...block(story.problems),
    ...block(spendLines(apiSpend)),
    `Open job-app: ${appUrl}`,
    ...(lanUrl ? [`Open job-app (LAN): ${lanUrl}`] : []),
    '',
  ].join('\n')
}

export function composeSummary(input: SummaryInput): Summary {
  return { subject: subjectOf(input.story), text: bodyOf(input) }
}
