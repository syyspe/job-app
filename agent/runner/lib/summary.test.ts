// @vitest-environment node
import { expect, test } from 'vitest'
import { fakeAd } from '../../test/fakeJobAppAds.ts'
import type { FakeAd } from '../../test/fakeJobAppAds.ts'
import { composeSummary, isEmpty } from './summary.ts'
import type { AdSummary } from './jobApp.ts'

const appUrl = 'https://jobs.lan.example'

function ad(fields: Partial<FakeAd> & { id: number }): AdSummary {
  const { body: _body, evaluation: _evaluation, ...summary } = fakeAd(fields)
  return summary
}

test('nothing to report composes the empty summary', () => {
  expect(composeSummary({ ads: [], sourceFailures: [], problems: [], appUrl })).toEqual({
    subject: 'job agent: 0 drafts, 0 title rejected, 0 failed, 0 source failures, 0 problems',
    text: `Open job-app: ${appUrl}\n`,
  })
})

test('isEmpty is true only when every list is empty', () => {
  const empty = { ads: [], sourceFailures: [], problems: [] }

  expect(isEmpty(empty)).toBe(true)
  expect(isEmpty({ ...empty, ads: [ad({ id: 1, state: 'failed' })] })).toBe(false)
  expect(isEmpty({ ...empty, sourceFailures: [{ source: 'valtiolle', date: '2026-11-20', kind: 'blocked' }] })).toBe(false)
  expect(isEmpty({ ...empty, problems: [{ step: 'evaluate', message: 'down' }] })).toBe(false)
})

test('every non-empty list gets its own section, and the subject counts them', () => {
  const summary = composeSummary({
    ads: [
      ad({ id: 1, state: 'drafted', title: 'Developer', company: 'Acme', applicationId: 101 }),
      ad({ id: 2, state: 'drafted', title: 'Tester', company: 'Beta', applicationId: 102 }),
      ad({ id: 3, state: 'title_rejected', title: 'Trainee', company: 'Gamma', source: 'duunitori', url: 'https://d.example/3' }),
      ad({ id: 4, state: 'failed', title: 'Architect', source: 'nordea', lastError: 'gone' }),
    ],
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
  const summary = composeSummary({ ads: [], sourceFailures: [], problems: [{ step: 'collect', message: 'x' }], appUrl })

  expect(summary.subject).toBe('job agent: 0 drafts, 0 title rejected, 0 failed, 0 source failures, 1 problem')
  expect(summary.text).toBe(`Problems (1)\n- collect: x\n\nOpen job-app: ${appUrl}\n`)
})

test('line breaks and control characters in ad text become spaces', () => {
  const title = 'Developer\r\nSubject: forged\u0000 end'

  const summary = composeSummary({
    ads: [ad({ id: 1, state: 'title_rejected', title, company: 'Acme', source: 's', url: 'u' })],
    sourceFailures: [],
    problems: [],
    appUrl,
  })

  expect(summary.text.split('\n')[1]).toBe('- Developer  Subject: forged  end, Acme, s: u')
})
