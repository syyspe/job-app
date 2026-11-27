// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { CliError } from '../../lib/cliError.ts'
import { startDailyRun } from '../../test/dailyRunFixture.ts'
import type { DailyRunFixture, Overrides } from '../../test/dailyRunFixture.ts'
import type { FakeJobApp } from '../../test/fakeJobApp.ts'
import { fakeAd } from '../../test/fakeJobAppAds.ts'
import type { FakeMailbox } from '../../test/fakeMailbox.ts'
import { runDaily } from './dailyRun.ts'
import type { PrescreenOutcome } from './prescreen.ts'
import { storyLines, storyOf } from './story.ts'
import type { EvaluationOutcome } from './evaluate.ts'
import type { MailMessage } from './smtp.ts'
import type { RunnerState } from './state.ts'

let fixture: DailyRunFixture
let fake: FakeJobApp
let state: RunnerState
let mailbox: FakeMailbox
let sent: MailMessage[]
let steps: string[]

beforeEach(async () => {
  fixture = await startDailyRun()
  fake = fixture.fake
  state = fixture.state
  mailbox = fixture.mailbox
  sent = fixture.sent
  steps = fixture.steps
})

afterEach(async () => {
  await fixture.close()
})

const options = (overrides: Overrides = {}) => fixture.options(overrides)

const appUrl = 'https://jobs.lan.example'

test('steps run in order, nothing is drafted, and the kept ad is in the summary', async () => {
  fake.ads.push(fakeAd({ id: 1, state: 'ready', title: 'Tester', url: 'https://jobs.example/1', firstSeenAt: '2026-11-20 08:00:00' }))

  const report = await runDaily(options())

  expect(steps).toEqual(['collect', 'health', 'gate', 'evaluate', 'send'])
  expect(report.sent).toBe(true)
  expect(report.failures).toEqual([])
  expect(fake.ads[0].state).toBe('suitable')
  expect(fake.drafts).toEqual([])
  expect(sent[0].subject).toBe('job agent: 1 kept, 0 set aside')
  expect(sent[0].text).toContain('Evaluation kept 1 of 1.')
  expect(sent[0].text).toContain('Tester, Example Oy\nAd: https://jobs.example/1\nFits.\nIn job-app: https://jobs.lan.example/#ad-1\n')
  expect(mailbox.closed).toBe(true)
})

test('a waiting hand-over is pre-screened, then fetched on request, then evaluated', async () => {
  fake.ads.push(
    fakeAd({
      id: 1,
      source: 'fetching',
      sourceMode: 'handover',
      state: 'awaiting_handover',
      fetchRequestedAt: '2026-11-20 09:00:00',
      firstSeenAt: '2026-11-20 08:00:00',
    }),
  )

  const report = await runDaily(options())

  expect(steps).toEqual(['collect', 'health', 'gate', 'prescreen', 'fetch', 'evaluate', 'send'])
  expect(report.fetch?.fetching).toEqual({ ready: 1, duplicate: 0, gone: 0, retrying: 0, failed: 0, blocked: 0 })
  expect(fake.ads[0]).toMatchObject({ state: 'suitable', prescreen: { verdict: 'promising', reason: 'Test work.' } })
  expect(sent[0].text).toContain('Pre-screening found 1 interesting job title and set aside 0. Evaluation kept 1 of 1.')
})

test('a new automatic ad is pre-screened, fetched because it is promising, then evaluated', async () => {
  fake.ads.push(fakeAd({ id: 1, source: 'auto', sourceMode: 'automatic', state: 'new', firstSeenAt: '2026-11-20 08:00:00' }))

  const report = await runDaily(options())

  expect(steps).toEqual(['collect', 'health', 'gate', 'prescreen', 'fetch', 'evaluate', 'send'])
  expect(report.fetch?.auto.ready).toBe(1)
  expect(fake.ads[0]).toMatchObject({ state: 'suitable', body: 'The fetched ad.' })
})

const notPromising: PrescreenOutcome = { kind: 'screened', prescreen: { verdict: 'not_promising', reason: 'A sales role.' } }

test('a not-promising ad is dismissed, not fetched, and listed with its job-site link', async () => {
  fake.ads.push(
    fakeAd({ id: 1, source: 'auto', sourceMode: 'automatic', title: 'Seller', url: 'https://auto.example/1', firstSeenAt: '2026-11-20 08:00:00' }),
  )

  await runDaily(options({ prescreen: async () => notPromising }))

  expect(steps).toEqual(['collect', 'health', 'gate', 'prescreen', 'send'])
  expect(fake.ads[0].state).toBe('dismissed')
  expect(sent[0].subject).toBe('job agent: 0 kept, 1 set aside')
  expect(sent[0].text).toContain('Set aside by the pre-screen:\n- Seller, Example Oy — A sales role.\n  Ad: https://auto.example/1\n')
})

test('a failed dismissal is a pre-screen failure, and the later steps still run', async () => {
  fake.ads.push(
    fakeAd({ id: 1, source: 'auto', sourceMode: 'automatic', firstSeenAt: '2026-11-20 08:00:00' }),
    fakeAd({ id: 2, state: 'ready', firstSeenAt: '2026-11-20 09:00:00' }),
  )
  fake.transitionFailsFor = 1

  const report = await runDaily(options({ prescreen: async () => notPromising }))

  expect(report.failures).toEqual([{ step: 'pre-screen', message: 'job-app POST /api/ads/1/transition: 500 internal server error' }])
  expect(steps).toEqual(['collect', 'health', 'gate', 'prescreen', 'evaluate', 'send'])
  expect(fake.ads[0]).toMatchObject({ state: 'new', prescreen: { verdict: 'not_promising' } })
  expect(sent[0].text).toContain('Pre-screening failed: job-app POST /api/ads/1/transition: 500 internal server error')
})

test('a pre-screen alone makes the summary worth sending', async () => {
  fake.ads.push(
    fakeAd({ id: 1, source: 'fetching', sourceMode: 'handover', state: 'awaiting_handover', firstSeenAt: '2026-11-20 08:00:00' }),
  )

  const report = await runDaily(options())

  expect(report.sent).toBe(true)
  expect(steps).toEqual(['collect', 'health', 'gate', 'prescreen', 'send'])
})

test('nothing to report sends no mail', async () => {
  const report = await runDaily(options())

  expect(report.sent).toBe(false)
  expect(sent).toEqual([])
})

test('nothing to report with alwaysSend sends the opening sentences and the link', async () => {
  const report = await runDaily(options({ alwaysSend: true }))

  expect(report.sent).toBe(true)
  expect(sent).toEqual([
    expect.objectContaining({
      subject: 'job agent: nothing new',
      text: `Read 0 new emails. No new job titles to pre-screen.\n\nOpen job-app: ${appUrl}\n`,
    }),
  ])
})

test('a configured lanUrl reaches the summary', async () => {
  await runDaily(options({ alwaysSend: true, lanUrl: 'https://192.0.2.1:3001' }))

  expect(sent[0].text).toContain('Open job-app (LAN): https://192.0.2.1:3001\n')
})

test('a failed ad is listed once, read once, and marked reported', async () => {
  fake.ads.push(fakeAd({ id: 1, state: 'failed', title: 'Architect', lastError: 'gone' }))

  const report = await runDaily(options())

  expect(report.news?.failedAds.map((ad) => ad.id)).toEqual([1])
  expect(fake.requests.filter((request) => request.includes('state=failed'))).toHaveLength(1)
  expect(sent[0].text).toContain('Architect, Example Oy failed three times (gone). Retry or dismiss it in job-app: https://jobs.lan.example/#ad-1')
  expect(fake.ads[0].reportedAt).not.toBeNull()
})

test('ads already reported are not reported again', async () => {
  fake.ads.push(fakeAd({ id: 1, state: 'failed', lastError: 'gone', reportedAt: '2026-11-19 20:00:00' }))

  await runDaily(options())

  expect(sent).toEqual([])
})

test('the email and the run output tell the same story', async () => {
  fake.ads.push(fakeAd({ id: 1, state: 'failed', lastError: 'gone' }), fakeAd({ id: 2, state: 'ready' }))
  state.addFailure({ source: 'nordea', date: '2026-11-20', kind: 'empty_alert' })

  const report = await runDaily(options())

  const story = storyOf(report, appUrl)
  expect(story.problems).toHaveLength(2)
  expect(sent[0].text).toContain(story.opening.join(' '))
  for (const line of storyLines(story)) expect(sent[0].text).toContain(line)
})

test('per-run caps leave the rest queued', async () => {
  fake.ads.push(
    fakeAd({ id: 1, state: 'ready', firstSeenAt: '2026-11-20 08:00:00' }),
    fakeAd({ id: 2, state: 'ready', firstSeenAt: '2026-11-20 09:00:00' }),
  )

  const report = await runDaily(options())

  expect(report.evaluation?.queued).toBe(1)
  expect(fake.ads.map((ad) => ad.state)).toEqual(['suitable', 'ready'])
  expect(sent[0].text).toContain('Evaluation kept 1 of 1. 1 more ad waits for the next run.')
})

test('a hand-over past its wait or deadline day is dismissed, one inside both is not', async () => {
  const handover = { state: 'awaiting_handover', sourceMode: 'handover' as const }
  fake.ads.push(
    fakeAd({ id: 1, ...handover, firstSeenAt: '2026-11-10 08:00:00' }),
    fakeAd({ id: 2, ...handover, firstSeenAt: '2026-11-18 08:00:00', deadline: '2026-11-19' }),
    fakeAd({ id: 3, ...handover, firstSeenAt: '2026-11-18 08:00:00', deadline: '2026-11-20' }),
  )

  const report = await runDaily(options())

  expect(report.dismissed).toBe(2)
  expect(fake.ads.map((ad) => ad.state)).toEqual(['dismissed', 'dismissed', 'awaiting_handover'])
})

test('Ollama down still collects and expires, skips the model steps and reports it', async () => {
  fake.ads.push(
    fakeAd({ id: 1, state: 'ready' }),
    fakeAd({ id: 2, state: 'awaiting_handover', sourceMode: 'handover', firstSeenAt: '2026-11-01 08:00:00' }),
  )

  const report = await runDaily(options({ health: { ok: false, reason: 'unreachable' } }))

  expect(steps).toEqual(['collect', 'health', 'send'])
  expect(report.failures).toEqual([])
  expect(report.dismissed).toBe(1)
  expect(fake.ads[0].state).toBe('ready')
  expect(sent[0].text).toContain('Pre-screening and evaluation were skipped: Ollama health check failed: unreachable')
})

test('a gate failure skips the model steps with its message', async () => {
  fake.ads.push(
    fakeAd({ id: 1, state: 'ready' }),
    fakeAd({
      id: 2,
      source: 'fetching',
      sourceMode: 'handover',
      state: 'awaiting_handover',
      fetchRequestedAt: '2026-11-20 09:00:00',
      firstSeenAt: '2026-11-20 08:00:00',
    }),
  )
  const gate = async () => {
    throw new CliError(1, 'sandbox check failed for claude 9.9.9: no Bash')
  }

  const report = await runDaily(options({ gate }))

  expect(report.skipped).toEqual({ step: 'model steps', message: 'sandbox check failed for claude 9.9.9: no Bash' })
  expect(report.failures).toEqual([])
  expect(steps).toEqual(['collect', 'health', 'send'])
  expect(report.prescreen).toBeNull()
  expect(report.fetch).toBeNull()
  expect(fake.ads.map((ad) => ad.state)).toEqual(['ready', 'awaiting_handover'])
  expect(sent[0].text).toContain('Pre-screening and evaluation were skipped: sandbox check failed for claude 9.9.9: no Bash')
})

test('an unreachable mailbox is a failure, and later steps still run', async () => {
  fake.ads.push(fakeAd({ id: 1, state: 'ready' }))
  const openMailbox = async () => {
    throw new CliError(1, 'cannot reach mailbox at imap.mail.example')
  }

  const report = await runDaily(options({ openMailbox }))

  expect(report.failures).toEqual([{ step: 'collect', message: 'cannot reach mailbox at imap.mail.example' }])
  expect(steps).toEqual(['health', 'gate', 'evaluate', 'send'])
  expect(sent[0].text).toContain('Reading the alert emails failed: cannot reach mailbox at imap.mail.example')
  expect(sent[0].text).not.toContain('new email')
})

test('a failed send marks nothing reported and keeps the source failures', async () => {
  fake.ads.push(fakeAd({ id: 1, state: 'failed', lastError: 'gone' }))
  state.addFailure({ source: 'nordea', date: '2026-11-20', kind: 'blocked' })
  const send = async () => {
    throw new CliError(1, 'cannot reach mail server at smtp.mail.example')
  }

  const report = await runDaily(options({ send }))

  expect(report.sent).toBe(false)
  expect(report.failures).toEqual([{ step: 'summary', message: 'cannot reach mail server at smtp.mail.example' }])
  expect(fake.ads[0].reportedAt).toBeNull()
  expect(state.readFailures()).toHaveLength(1)
})

test('an accepted send clears the source failures it reported', async () => {
  state.addFailure({ source: 'nordea', date: '2026-11-20', kind: 'blocked' })

  await runDaily(options())

  expect(sent[0].text).toContain('Nordea blocked fetching on 2026-11-20; fetching resumes the next day.')
  expect(state.readFailures()).toEqual([])
})

test('markReported failing after an accepted send fails the run and keeps the failures', async () => {
  fake.ads.push(fakeAd({ id: 1, state: 'failed', lastError: 'gone' }))
  state.addFailure({ source: 'nordea', date: '2026-11-20', kind: 'blocked' })
  fake.failure = 'reported'

  const report = await runDaily(options())

  expect(report.sent).toBe(true)
  expect(report.failures).toEqual([
    { step: 'summary', message: 'job-app POST /api/ads/reported: 500 internal server error' },
  ])
  expect(state.readFailures()).toHaveLength(1)
})

test('an error that is not a CliError propagates', async () => {
  fake.ads.push(fakeAd({ id: 1, state: 'ready' }))
  const evaluate = async (): Promise<EvaluationOutcome> => {
    throw new TypeError('bug')
  }

  await expect(runDaily(options({ evaluate }))).rejects.toThrow('bug')
})

test('a gate resolving null runs the model steps with no sandbox recorded', async () => {
  fake.ads.push(fakeAd({ id: 1, state: 'ready', firstSeenAt: '2026-11-20 08:00:00' }))

  const report = await runDaily(options({ gate: async () => (steps.push('gate'), null) }))

  expect(steps).toEqual(['collect', 'health', 'gate', 'evaluate', 'send'])
  expect(report.sandbox).toBeNull()
  expect(report.stopped).toBeNull()
})

test('an evaluation that fails an ad into failed puts its detail on its sentence', async () => {
  fake.ads.push(fakeAd({ id: 1, state: 'ready', title: 'Architect', attempts: 2 }))
  const evaluate = async (): Promise<EvaluationOutcome> => ({
    kind: 'failed',
    category: 'model_failed',
    detail: '400: maxItems is not supported (request req_9)',
  })

  await runDaily(options({ evaluate }))

  expect(fake.ads[0]).toMatchObject({ state: 'failed', lastError: 'model_failed' })
  expect(sent[0].text).toContain(
    'Architect, Example Oy failed three times (model_failed — 400: maxItems is not supported (request req_9)). Retry or dismiss it in job-app: https://jobs.lan.example/#ad-1',
  )
})
