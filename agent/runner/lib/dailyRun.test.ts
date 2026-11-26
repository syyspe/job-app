// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { CliError } from '../../lib/cliError.ts'
import { startDailyRun } from '../../test/dailyRunFixture.ts'
import type { DailyRunFixture, Overrides } from '../../test/dailyRunFixture.ts'
import type { FakeJobApp } from '../../test/fakeJobApp.ts'
import { fakeAd } from '../../test/fakeJobAppAds.ts'
import type { FakeMailbox } from '../../test/fakeMailbox.ts'
import { runDaily } from './dailyRun.ts'
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

test('steps run in order and the drafted ad is reported once', async () => {
  fake.ads.push(fakeAd({ id: 1, state: 'ready', firstSeenAt: '2026-11-20 08:00:00' }))

  const report = await runDaily(options())

  expect(steps).toEqual(['collect', 'health', 'gate', 'evaluate', 'draft', 'send'])
  expect(report.sent).toBe(true)
  expect(report.failures).toEqual([])
  expect(sent[0].subject).toBe('job agent: 1 draft, 0 title rejected, 0 failed, 0 source failures, 0 problems')
  expect(fake.ads[0]).toMatchObject({ state: 'drafted', reportedAt: '2026-12-01 20:00:00' })
  expect(mailbox.closed).toBe(true)
})

test('a waiting hand-over is pre-screened, then fetched on request, then evaluated and drafted', async () => {
  fake.ads.push(
    fakeAd({
      id: 1,
      source: 'fetching',
      sourceMode: 'handover',
      state: 'awaiting_handover',
      title: 'Tester',
      company: 'Acme',
      fetchRequestedAt: '2026-11-20 09:00:00',
      firstSeenAt: '2026-11-20 08:00:00',
    }),
  )

  const report = await runDaily(options())

  expect(steps).toEqual(['collect', 'health', 'gate', 'prescreen', 'fetch', 'evaluate', 'draft', 'send'])
  expect(report.prescreen?.screened).toEqual({ promising: 1, notPromising: 0 })
  expect(report.handoverFetch).toEqual({
    fetching: { ready: 1, duplicate: 0, gone: 0, retrying: 0, failed: 0, blocked: 0 },
  })
  expect(fake.ads[0]).toMatchObject({ state: 'drafted', prescreen: { verdict: 'promising', reason: 'Test work.' } })
  expect(sent[0].text).toContain('Pre-screened (1)\n- Tester, Acme: promising — Test work.\n')
  expect(sent[0].text).toContain('Pre-screen vs. Fetch, last 14 days: promising 1 (fetched 1), not promising 0 (fetched 0)')
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

test('nothing to report with alwaysSend sends the empty summary', async () => {
  const report = await runDaily(options({ alwaysSend: true }))

  expect(report.sent).toBe(true)
  expect(sent).toHaveLength(1)
  expect(sent[0].subject).toBe('job agent: 0 drafts, 0 title rejected, 0 failed, 0 source failures, 0 problems')
  expect(sent[0].text).toContain('Open job-app:')
})

test('a configured lanUrl reaches the summary', async () => {
  await runDaily(options({ alwaysSend: true, lanUrl: 'https://192.0.2.1:3001' }))

  expect(sent[0].text).toContain('Open job-app (LAN): https://192.0.2.1:3001\n')
})

test('ads already reported are not reported again', async () => {
  fake.ads.push(fakeAd({ id: 1, state: 'title_rejected', reportedAt: '2026-11-19 20:00:00' }))

  await runDaily(options())

  expect(sent).toEqual([])
})

test('per-run caps leave the rest queued', async () => {
  fake.ads.push(
    fakeAd({ id: 1, state: 'ready', firstSeenAt: '2026-11-20 08:00:00' }),
    fakeAd({ id: 2, state: 'ready', firstSeenAt: '2026-11-20 09:00:00' }),
  )

  const report = await runDaily(options())

  expect(report.evaluation?.queued).toBe(1)
  expect(fake.ads.map((ad) => ad.state)).toEqual(['drafted', 'ready'])
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
  expect(sent[0].text).toContain('- model steps: Ollama health check failed: unreachable')
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
  expect(report.handoverFetch).toBeNull()
  expect(fake.ads.map((ad) => ad.state)).toEqual(['ready', 'awaiting_handover'])
  expect(sent[0].text).toContain('- model steps: sandbox check failed for claude 9.9.9: no Bash')
})

test('an unreachable mailbox is a failure, and later steps still run', async () => {
  fake.ads.push(fakeAd({ id: 1, state: 'ready' }))
  const openMailbox = async () => {
    throw new CliError(1, 'cannot reach mailbox at imap.mail.example')
  }

  const report = await runDaily(options({ openMailbox }))

  expect(report.failures).toEqual([{ step: 'collect', message: 'cannot reach mailbox at imap.mail.example' }])
  expect(steps).toEqual(['health', 'gate', 'evaluate', 'draft', 'send'])
  expect(sent[0].text).toContain('- collect: cannot reach mailbox at imap.mail.example')
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

  expect(sent[0].text).toContain('- nordea 2026-11-20 blocked')
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

  expect(steps).toEqual(['collect', 'health', 'gate', 'evaluate', 'draft', 'send'])
  expect(report.sandbox).toBeNull()
  expect(report.stopped).toBeNull()
})

test("an evaluation that fails an ad into failed puts its detail on the summary's Failed line", async () => {
  fake.ads.push(fakeAd({ id: 1, state: 'ready', title: 'Architect', attempts: 2 }))
  const evaluate = async (): Promise<EvaluationOutcome> => ({
    kind: 'failed',
    category: 'model_failed',
    detail: '400: maxItems is not supported (request req_9)',
  })

  await runDaily(options({ evaluate }))

  expect(fake.ads[0]).toMatchObject({ state: 'failed', lastError: 'model_failed' })
  expect(sent[0].text).toContain('- Architect, testsource: model_failed — 400: maxItems is not supported (request req_9)\n')
})
