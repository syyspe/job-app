// @vitest-environment node
import { expect, test } from 'vitest'
import { fakeAd } from '../../test/fakeJobAppAds.ts'
import type { FakeAd } from '../../test/fakeJobAppAds.ts'
import type { AdSummary } from './jobApp.ts'
import type { Story } from './story.ts'
import { composeSummary } from './summary.ts'

const appUrl = 'https://jobs.lan.example/'

function ad(fields: Partial<FakeAd> & { id: number }): AdSummary {
  const { body: _body, evaluation: _evaluation, ...summary } = fakeAd(fields)
  return summary
}

function story(fields: Partial<Story> = {}): Story {
  return { opening: [], problems: [], promising: [], setAside: [], kept: [], ...fields }
}

const compose = (fields: Partial<Story>, apiSpend = null) => composeSummary({ story: story(fields), apiSpend, appUrl })

test('nothing new: the opening sentences and the link', () => {
  const summary = compose({ opening: ['Read 0 new emails.', 'No new job titles to pre-screen.'] })

  expect(summary).toEqual({
    subject: 'job agent: nothing new',
    text: `Read 0 new emails. No new job titles to pre-screen.\n\nOpen job-app: ${appUrl}\n`,
  })
})

test('the subject counts kept, set aside and problems', () => {
  const kept = [{ ad: ad({ id: 1 }), fitSummary: 'Fits.' }]
  const setAside = [ad({ id: 2 }), ad({ id: 3 })]

  expect(compose({ kept, setAside }).subject).toBe('job agent: 1 kept, 2 set aside')
  expect(compose({ kept, problems: ['a', 'b'] }).subject).toBe('job agent: 1 kept, 0 set aside, 2 problems')
  expect(compose({ problems: ['a'] }).subject).toBe('job agent: nothing new, 1 problem')
})

test('a kept ad carries both links and its fit summary', () => {
  const kept = [{ ad: ad({ id: 4, title: 'Test Lead', company: 'Acme Oy', url: 'https://jobs.example/4' }), fitSummary: 'Strong\nfit.' }]

  const { text } = compose({ opening: ['Evaluation kept 1 of 2.'], kept })

  expect(text).toBe(
    [
      'Evaluation kept 1 of 2.',
      '',
      'Test Lead, Acme Oy',
      'Ad: https://jobs.example/4',
      'Strong fit.',
      'In job-app: https://jobs.lan.example/#ad-4',
      '',
      `Open job-app: ${appUrl}`,
      '',
    ].join('\n'),
  )
})

test('a configured lanUrl adds a LAN link to each kept ad', () => {
  const kept = [{ ad: ad({ id: 4, title: 'Test Lead', company: 'Acme Oy', url: 'https://jobs.example/4' }), fitSummary: 'Fits.' }]

  const { text } = composeSummary({ story: story({ kept }), apiSpend: null, appUrl, lanUrl: 'http://192.168.1.5:3001' })

  expect(text).toContain(
    'In job-app: https://jobs.lan.example/#ad-4\nIn job-app (LAN): http://192.168.1.5:3001/#ad-4\n',
  )
})

test('a set-aside ad carries its reason and its job-site link', () => {
  const prescreen = { verdict: 'not_promising' as const, reason: 'A sales role.' }
  const setAside = [ad({ id: 5, title: 'Account Manager', company: 'Sell Oy', url: 'https://jobs.example/5', prescreen })]

  expect(compose({ setAside }).text).toBe(
    [
      'Set aside by the pre-screen:',
      '- Account Manager, Sell Oy — A sales role.',
      '  Ad: https://jobs.example/5',
      '',
      `Open job-app: ${appUrl}`,
      '',
    ].join('\n'),
  )
})

test('problems and spend come before the links, the LAN link last', () => {
  const apiSpend = { runUsd: 0.1234, monthUsd: 4.1, monthlyUsd: 30 }
  const summary = composeSummary({
    story: story({ problems: ['Fetching ads failed: x'] }),
    apiSpend,
    appUrl,
    lanUrl: 'http://192.168.1.5:3001',
  })

  expect(summary.text).toBe(
    [
      'Fetching ads failed: x',
      '',
      'Claude API: $0.12 this run, $4.10 of $30.00 this month.',
      '',
      `Open job-app: ${appUrl}`,
      'Open job-app (LAN): http://192.168.1.5:3001',
      '',
    ].join('\n'),
  )
})
