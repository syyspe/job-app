// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { fakeAd } from '../../test/fakeJobAppAds.ts'
import type { FakeAd } from '../../test/fakeJobAppAds.ts'
import type { DailyReport } from './dailyRun.ts'
import type { EvaluationReport } from './evaluationRun.ts'
import type { AdSummary } from './jobApp.ts'
import type { PrescreenReport } from './prescreenRun.ts'
import { adLink, hasNews, storyLines, storyOf } from './story.ts'

const appUrl = 'https://jobs.lan.example/'

function ad(fields: Partial<FakeAd> & { id: number }): AdSummary {
  const { body: _body, evaluation: _evaluation, ...summary } = fakeAd(fields)
  return summary
}

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

const source = { messages: 1, newAds: 3, existingAds: 0, emptyAlerts: 0 }
const screened = { titleRejected: 0, awaitingHandover: 0, leftNew: 0 }

function prescreen(fields: Partial<PrescreenReport> = {}): PrescreenReport {
  return { promising: [], setAside: [], failed: 0, queued: 0, failedAttempts: [], ...fields }
}

function evaluation(fields: Partial<EvaluationReport> = {}): EvaluationReport {
  const evaluated = { suitable: 0, unsuitable: 0, retrying: 0, failed: 0 }
  return { screened, skipped: null, evaluated, kept: [], queued: 0, failedAttempts: [], ...fields }
}

const lines = (fields: Partial<DailyReport>) => storyLines(storyOf(report(fields), appUrl))

test('an ad link is a hash on the app URL', () => {
  expect(adLink('https://jobs.lan.example', 7)).toBe('https://jobs.lan.example/#ad-7')
  expect(adLink('https://jobs.lan.example/app/', 7)).toBe('https://jobs.lan.example/app/#ad-7')
})

describe('opening', () => {
  test('emails read, summed over the sources, singular and plural', () => {
    expect(lines({ collect: { sources: { a: source, b: source }, screened } })).toEqual(['Read 2 new emails.'])
    expect(lines({ collect: { sources: { a: source }, screened } })).toEqual(['Read 1 new email.'])
  })

  test('a failed collect says nothing about emails', () => {
    expect(storyOf(report(), appUrl).opening).toEqual([])
  })

  test('pre-screening found and set aside', () => {
    const one = prescreen({ promising: [ad({ id: 1 })], setAside: [ad({ id: 2 }), ad({ id: 3 })] })
    const two = prescreen({ promising: [ad({ id: 1 }), ad({ id: 2 })] })

    expect(lines({ prescreen: one })).toEqual(['Pre-screening found 1 interesting job title and set aside 2.'])
    expect(lines({ prescreen: two })).toEqual(['Pre-screening found 2 interesting job titles and set aside 0.'])
  })

  test('nothing to pre-screen', () => {
    expect(lines({ prescreen: prescreen() })).toEqual(['No new job titles to pre-screen.'])
  })

  test('queued titles wait for the next run', () => {
    const found = prescreen({ promising: [ad({ id: 1 })], queued: 1 })

    expect(lines({ prescreen: found })).toEqual([
      'Pre-screening found 1 interesting job title and set aside 0.',
      '1 more job title waits for the next run.',
    ])
    expect(lines({ prescreen: prescreen({ queued: 3 }) })).toEqual(['3 more job titles wait for the next run.'])
  })

  test('evaluation kept N of M, and its queue', () => {
    const kept = [{ ad: ad({ id: 1, state: 'suitable' }), fitSummary: 'Fits.' }]
    const evaluated = { suitable: 1, unsuitable: 2, retrying: 0, failed: 0 }

    expect(lines({ evaluation: evaluation({ evaluated, kept, queued: 2 }) })).toEqual([
      'Evaluation kept 1 of 3.',
      '2 more ads wait for the next run.',
    ])
  })

  test('nothing evaluated says nothing', () => {
    expect(lines({ evaluation: evaluation() })).toEqual([])
  })

  test('a re-verified sandbox is named, a passing one is not', () => {
    expect(lines({ sandbox: { version: '2.1.0', reverified: true } })).toEqual(['Sandbox re-verified for claude 2.1.0.'])
    expect(lines({ sandbox: { version: '2.1.0', reverified: false } })).toEqual([])
  })
})

describe('problems', () => {
  const problems = (fields: Partial<DailyReport>) => storyOf(report(fields), appUrl).problems

  test('none when nothing went wrong', () => {
    expect(problems({ prescreen: prescreen(), evaluation: evaluation(), news: { failedAds: [], sourceFailures: [] } })).toEqual([])
  })

  test.each([
    ['collect', 'Reading the alert emails'],
    ['expire hand-overs', 'Expiring old hand-overs'],
    ['sync', 'Profile sync'],
    ['pre-screen', 'Pre-screening'],
    ['fetch', 'Fetching ads'],
    ['evaluate', 'Evaluation'],
    ['API spend', 'Spend check'],
    ['summary', 'Sending the summary'],
  ])('a failed %s step', (step, label) => {
    expect(problems({ failures: [{ step, message: 'cannot reach job-app' }] })).toEqual([`${label} failed: cannot reach job-app`])
  })

  test('a skip and a budget stop', () => {
    const skipped = { step: 'model steps', message: 'Ollama health check failed: down' }
    const stopped = { step: 'model steps', message: 'run budget reached' }

    expect(problems({ skipped, stopped })).toEqual([
      'Pre-screening and evaluation were skipped: Ollama health check failed: down',
      'Stopped before the remaining model steps: run budget reached',
    ])
  })

  test('retries, singular and plural', () => {
    const retrying = evaluation({ evaluated: { suitable: 0, unsuitable: 0, retrying: 2, failed: 0 } })

    expect(problems({ prescreen: prescreen({ failed: 1 }), evaluation: retrying })).toEqual([
      'Pre-screening could not finish 1 ad; it will be tried again next run.',
      'Evaluation could not finish 2 ads; they will be tried again next run.',
    ])
  })

  test('a failed ad, with this run’s detail when it has one', () => {
    const failedAds = [
      ad({ id: 4, title: 'Tester', company: 'Acme Oy', state: 'failed', lastError: 'timeout' }),
      ad({ id: 5, title: 'Lead', company: '', state: 'failed', lastError: 'gone' }),
    ]
    const failedAttempts = [{ adId: 4, title: 'Tester', source: 's', category: 'timeout', detail: 'no answer\nin 60 s' }]

    expect(problems({ news: { failedAds, sourceFailures: [] }, evaluation: evaluation({ failedAttempts }) })).toEqual([
      'Tester, Acme Oy failed three times (timeout — no answer in 60 s). Retry or dismiss it in job-app: https://jobs.lan.example/#ad-4',
      'Lead failed three times (gone). Retry or dismiss it in job-app: https://jobs.lan.example/#ad-5',
    ])
  })

  test('an empty alert and a block', () => {
    const sourceFailures = [
      { source: 'duunitori', date: '2026-11-26', kind: 'empty_alert' as const },
      { source: 'nordea', date: '2026-11-27', kind: 'blocked' as const },
    ]

    expect(problems({ news: { failedAds: [], sourceFailures } })).toEqual([
      "Duunitori's alert of 2026-11-26 had no ads in it — check whether its format changed.",
      'Nordea blocked fetching on 2026-11-27; fetching resumes the next day.',
    ])
  })

  test('problems follow the opening in the lines', () => {
    const story = storyOf(report({ prescreen: prescreen(), failures: [{ step: 'fetch', message: 'x' }] }), appUrl)

    expect(storyLines(story)).toEqual(['No new job titles to pre-screen.', 'Fetching ads failed: x'])
  })
})

describe('news', () => {
  test('a run that only read mail has none', () => {
    expect(hasNews(storyOf(report({ collect: { sources: { a: source }, screened }, prescreen: prescreen() }), appUrl))).toBe(false)
  })

  test.each<[string, Partial<DailyReport>]>([
    ['a promising title', { prescreen: prescreen({ promising: [ad({ id: 1 })] }) }],
    ['a set-aside title', { prescreen: prescreen({ setAside: [ad({ id: 1 })] }) }],
    ['a kept ad', { evaluation: evaluation({ kept: [{ ad: ad({ id: 1 }), fitSummary: 'Fits.' }] }) }],
    ['a problem', { failures: [{ step: 'fetch', message: 'x' }] }],
  ])('%s is news', (_name, fields) => {
    expect(hasNews(storyOf(report(fields), appUrl))).toBe(true)
  })
})
