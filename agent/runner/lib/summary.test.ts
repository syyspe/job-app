// @vitest-environment node
import { expect, test } from 'vitest'
import { fakeAd } from '../../test/fakeJobAppAds.ts'
import type { FakeAd } from '../../test/fakeJobAppAds.ts'
import { composeSummary, isEmpty, prescreenTally } from './summary.ts'
import type { AdSummary } from './jobApp.ts'

const appUrl = 'https://jobs.lan.example'
const NO_TALLY = { promising: { total: 0, fetched: 0 }, notPromising: { total: 0, fetched: 0 } }
const none = { prescreened: [], tally: NO_TALLY }

function ad(fields: Partial<FakeAd> & { id: number }): AdSummary {
  const { body: _body, evaluation: _evaluation, ...summary } = fakeAd(fields)
  return summary
}

test('nothing to report composes the empty summary', () => {
  expect(composeSummary({ ads: [], ...none, sourceFailures: [], problems: [], appUrl })).toEqual({
    subject: 'job agent: 0 drafts, 0 title rejected, 0 failed, 0 source failures, 0 problems',
    text: `Open job-app: ${appUrl}\n`,
  })
})

test('a lanUrl adds a second link directly under the first', () => {
  const lanUrl = 'https://192.0.2.1:3001'
  const summary = composeSummary({ ads: [], ...none, sourceFailures: [], problems: [], appUrl, lanUrl })

  expect(summary.text).toBe(`Open job-app: ${appUrl}\nOpen job-app (LAN): ${lanUrl}\n`)
})

test('isEmpty is true only when every list is empty', () => {
  const empty = { ads: [], prescreened: [], sourceFailures: [], problems: [] }

  expect(isEmpty(empty)).toBe(true)
  expect(isEmpty({ ...empty, ads: [ad({ id: 1, state: 'failed' })] })).toBe(false)
  expect(isEmpty({ ...empty, sourceFailures: [{ source: 'valtiolle', date: '2026-11-20', kind: 'blocked' }] })).toBe(false)
  expect(isEmpty({ ...empty, problems: [{ step: 'evaluate', message: 'down' }] })).toBe(false)
  expect(isEmpty({ ...empty, prescreened: [ad({ id: 1, state: 'awaiting_handover' })] })).toBe(false)
})

test('every non-empty list gets its own section, and the subject counts them', () => {
  const summary = composeSummary({
    ads: [
      ad({ id: 1, state: 'drafted', title: 'Developer', company: 'Acme', applicationId: 101 }),
      ad({ id: 2, state: 'drafted', title: 'Tester', company: 'Beta', applicationId: 102 }),
      ad({ id: 3, state: 'title_rejected', title: 'Trainee', company: 'Gamma', source: 'duunitori', url: 'https://d.example/3' }),
      ad({ id: 4, state: 'failed', title: 'Architect', source: 'nordea', lastError: 'gone' }),
    ],
    ...none,
    sourceFailures: [{ source: 'valtiolle', date: '2026-11-20', kind: 'blocked' }],
    problems: [{ step: 'evaluate', message: 'Ollama health check failed: unreachable' }],
    appUrl,
  })

  expect(summary.subject).toBe('job agent: 2 drafts, 1 title rejected, 1 failed, 1 source failure, 1 problem')
  expect(summary.text).toBe(
    [
      'Drafts (2)',
      '- Developer, Acme (application 101)',
      '- Tester, Beta (application 102)',
      '',
      'Title rejected (1)',
      '- Trainee, Gamma, duunitori: https://d.example/3',
      '',
      'Failed (1)',
      '- Architect, nordea: gone',
      '',
      'Source failures (1)',
      '- valtiolle 2026-11-20 blocked',
      '',
      'Problems (1)',
      '- evaluate: Ollama health check failed: unreachable',
      '',
      `Open job-app: ${appUrl}`,
      '',
    ].join('\n'),
  )
})

test('only a problem still composes a summary with just that section', () => {
  const summary = composeSummary({ ads: [], ...none, sourceFailures: [], problems: [{ step: 'collect', message: 'x' }], appUrl })

  expect(summary.subject).toBe('job agent: 0 drafts, 0 title rejected, 0 failed, 0 source failures, 1 problem')
  expect(summary.text).toBe(`Problems (1)\n- collect: x\n\nOpen job-app: ${appUrl}\n`)
})

test('line breaks and control characters in ad text become spaces', () => {
  const title = 'Developer\r\nSubject: forged\u0000 end'

  const summary = composeSummary({
    ads: [ad({ id: 1, state: 'title_rejected', title, company: 'Acme', source: 's', url: 'u' })],
    ...none,
    sourceFailures: [],
    problems: [],
    appUrl,
  })

  expect(summary.text.split('\n')[1]).toBe('- Developer  Subject: forged  end, Acme, s: u')
})

test('pre-screened ads get a section, then the 14-day tally', () => {
  const prescreened = [
    ad({ id: 1, state: 'awaiting_handover', title: 'Tester', company: 'Acme', prescreen: { verdict: 'promising', reason: 'Test work.' } }),
    ad({ id: 2, state: 'awaiting_handover', title: 'Sales', company: 'Beta', prescreen: { verdict: 'not_promising', reason: 'Sales.' } }),
  ]
  const tally = { promising: { total: 3, fetched: 2 }, notPromising: { total: 4, fetched: 1 } }

  const summary = composeSummary({ ads: [], prescreened, tally, sourceFailures: [], problems: [], appUrl })

  expect(summary.text).toBe(
    [
      'Pre-screened (2)',
      '- Tester, Acme: promising — Test work.',
      '- Sales, Beta: not promising — Sales.',
      '',
      'Pre-screen vs. Fetch, last 14 days: promising 3 (fetched 2), not promising 4 (fetched 1)',
      '',
      `Open job-app: ${appUrl}`,
      '',
    ].join('\n'),
  )
})

test('a pre-screen reason has its control characters cleaned', () => {
  const prescreen = { verdict: 'promising' as const, reason: 'Fits.\nSubject: forged' }
  const prescreened = [ad({ id: 1, state: 'awaiting_handover', title: 'Tester', company: 'Acme', prescreen })]

  const summary = composeSummary({ ads: [], prescreened, tally: NO_TALLY, sourceFailures: [], problems: [], appUrl })

  expect(summary.text.split('\n')[1]).toBe('- Tester, Acme: promising — Fits. Subject: forged')
})

test('the tally counts hand-over ads first seen in the last 14 days, fetched meaning clicked', () => {
  const now = new Date('2026-11-23T12:00:00Z')
  const promising = { verdict: 'promising' as const, reason: '' }
  const notPromising = { verdict: 'not_promising' as const, reason: '' }
  const ads = [
    ad({ id: 1, sourceMode: 'handover', prescreen: promising, fetchRequestedAt: '2026-11-20 08:00:00', firstSeenAt: '2026-11-20 08:00:00' }),
    ad({ id: 2, sourceMode: 'handover', prescreen: promising, firstSeenAt: '2026-11-09 12:00:00' }),
    ad({ id: 3, sourceMode: 'handover', prescreen: notPromising, fetchRequestedAt: '2026-11-21 08:00:00', firstSeenAt: '2026-11-21 08:00:00' }),
    ad({ id: 4, sourceMode: 'handover', prescreen: promising, firstSeenAt: '2026-11-09 11:59:59' }),
    ad({ id: 5, sourceMode: 'automatic', prescreen: promising, firstSeenAt: '2026-11-20 08:00:00' }),
    ad({ id: 6, sourceMode: 'handover', firstSeenAt: '2026-11-20 08:00:00' }),
  ]

  expect(prescreenTally(ads, now)).toEqual({ promising: { total: 2, fetched: 1 }, notPromising: { total: 1, fetched: 1 } })
})
