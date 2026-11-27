// @vitest-environment node
import { expect, test } from 'vitest'
import { fakeAd } from '../../test/fakeJobAppAds.ts'
import type { DailyReport } from './dailyRun.ts'
import { runOutputLines } from './runOutput.ts'

function report(fields: Partial<DailyReport> = {}): DailyReport {
  return {
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
    ...fields,
  }
}

test('the story, the kept titles, the summary line, and the api line last', () => {
  const { body: _body, evaluation: _evaluation, ...ad } = fakeAd({ id: 1, title: 'Tester', company: 'Acme Oy', state: 'suitable' })
  const evaluated = { suitable: 1, unsuitable: 0, retrying: 0, failed: 0 }
  const screened = { titleRejected: 0, awaitingHandover: 0, leftNew: 0 }
  const evaluation = { screened, skipped: null, evaluated, kept: [{ ad, fitSummary: 'Fits.' }], queued: 0, failedAttempts: [] }

  const lines = runOutputLines(
    report({ evaluation, sent: true, apiSpend: { runUsd: 0.125, monthUsd: 4.1, monthlyUsd: 30 } }),
    'https://jobs.lan.example',
  )

  expect(lines).toEqual(['Evaluation kept 1 of 1.', 'Kept: Tester, Acme Oy', 'summary: sent', 'api: $0.13 run, $4.10 month'])
})

test('no spend prints no api line', () => {
  expect(runOutputLines(report(), 'https://jobs.lan.example')).toEqual(['summary: nothing to report'])
})
