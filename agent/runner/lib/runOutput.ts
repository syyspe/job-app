import type { DailyReport } from './dailyRun.ts'
import { adName, storyLines, storyOf } from './story.ts'

function keptLines({ evaluation }: DailyReport): string[] {
  return (evaluation?.kept ?? []).map(({ ad }) => `Kept: ${adName(ad)}`)
}

function summaryLine(report: DailyReport): string {
  if (report.sent) return 'summary: sent'
  if (report.failures.some((failure) => failure.step === 'summary')) return 'summary: not sent'
  return 'summary: nothing to report'
}

// Last on stdout: the run panel reads the figures from this line.
function spendLines({ apiSpend }: DailyReport): string[] {
  if (!apiSpend) return []
  return [`api: $${apiSpend.runUsd.toFixed(2)} run, $${apiSpend.monthUsd.toFixed(2)} month`]
}

// What agent:run prints to stdout: the summary's own sentences, then the kept
// titles, whether the summary went out, and the spend.
export function runOutputLines(report: DailyReport, appUrl: string): string[] {
  return [...storyLines(storyOf(report, appUrl)), ...keptLines(report), summaryLine(report), ...spendLines(report)]
}
