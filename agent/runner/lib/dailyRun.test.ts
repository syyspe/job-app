// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { CliError } from '../../lib/cliError.ts'
import { startFakeJobApp } from '../../test/fakeJobApp.ts'
import type { FakeJobApp } from '../../test/fakeJobApp.ts'
import { fakeAd } from '../../test/fakeJobAppAds.ts'
import { fakeMailbox } from '../../test/fakeMailbox.ts'
import type { FakeMailbox } from '../../test/fakeMailbox.ts'
import { makeTempDir } from '../../test/tempDir.ts'
import type { TempDir } from '../../test/tempDir.ts'
import type { HealthResult } from '../../profile/lib/ollama.ts'
import { runDaily } from './dailyRun.ts'
import type { DailyRunOptions } from './dailyRun.ts'
import type { DraftOutcome } from './draft.ts'
import type { EvaluationOutcome } from './evaluate.ts'
import { createJobAppClient } from './jobApp.ts'
import type { MailMessage } from './smtp.ts'
import { createRunnerState } from './state.ts'
import type { RunnerState } from './state.ts'

let fake: FakeJobApp
let dir: TempDir
let state: RunnerState
let mailbox: FakeMailbox
let sent: MailMessage[]
let steps: string[]

beforeEach(async () => {
  fake = await startFakeJobApp()
  dir = makeTempDir()
  state = createRunnerState(dir.root)
  mailbox = fakeMailbox([])
  sent = []
  steps = []
})

afterEach(async () => {
  dir.remove()
  await fake.close()
})

const suitable: EvaluationOutcome = {
  kind: 'evaluated',
  transition: { to: 'suitable', evaluation: { verdict: 'suitable', fitSummary: 'Fits.', reasons: [] } },
}

const written: DraftOutcome = {
  kind: 'written',
  output: {
    language: 'en',
    applicationType: 'portal',
    company: '',
    role: '',
    applyTo: '',
    fitSummary: 'Fits.',
    coverLetter: 'Letter.',
    cv: 'CV',
    questions: [],
  },
}

const NOW = new Date(2026, 10, 20, 20, 0)

interface Overrides {
  health?: HealthResult
  gate?: DailyRunOptions['gate']
  send?: DailyRunOptions['send']
  openMailbox?: DailyRunOptions['openMailbox']
  evaluate?: () => Promise<EvaluationOutcome>
}

function options(overrides: Overrides = {}): DailyRunOptions {
  const jobApp = createJobAppClient({ baseUrl: fake.url, username: fake.username, password: fake.password, envPath: 'env' })
  const evaluation = { concurrency: 1, perRunCap: 1, timeoutMs: 1000 }
  const drafting = { concurrency: 1, perRunCap: 1, timeoutMs: 1000, filePrefix: 'T', cvTemplates: { fi: '/fi', en: '/en' } }
  return {
    jobApp,
    state,
    openMailbox: overrides.openMailbox ?? (async () => (steps.push('collect'), mailbox)),
    collect: { connectors: [], sources: {}, titleRules: [], today: '2026-11-20', httpFor: () => { throw new Error('no fetch') } },
    handoverWaitDays: 7,
    checkHealth: async () => (steps.push('health'), overrides.health ?? { ok: true }),
    gate: overrides.gate ?? (async () => (steps.push('gate'), { version: '9.9.9', reverified: false })),
    sync: null,
    evaluation: {
      config: { titleRules: { reject: [] }, evaluation },
      evaluate: overrides.evaluate ?? (async () => (steps.push('evaluate'), suitable)),
    },
    drafting: { config: drafting, write: async () => (steps.push('draft'), written), today: '2026-11-20' },
    summary: { recipient: 'me@mail.example', appUrl: 'https://jobs.lan.example' },
    send: overrides.send ?? (async (message) => void (steps.push('send'), sent.push(message))),
    now: () => NOW,
  }
}

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

test('nothing to report sends no mail', async () => {
  const report = await runDaily(options())

  expect(report.sent).toBe(false)
  expect(sent).toEqual([])
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
  fake.ads.push(fakeAd({ id: 1, state: 'ready' }))
  const gate = async () => {
    throw new CliError(1, 'sandbox check failed for claude 9.9.9: no Bash')
  }

  const report = await runDaily(options({ gate }))

  expect(report.skipped).toEqual({ step: 'model steps', message: 'sandbox check failed for claude 9.9.9: no Bash' })
  expect(report.failures).toEqual([])
  expect(fake.ads[0].state).toBe('ready')
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
