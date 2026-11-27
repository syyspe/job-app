import type { HealthResult } from '../profile/lib/ollama.ts'
import type { DailyRunOptions } from '../runner/lib/dailyRun.ts'
import type { EvaluationOutcome } from '../runner/lib/evaluate.ts'
import { createJobAppClient } from '../runner/lib/jobApp.ts'
import type { PrescreenOutcome } from '../runner/lib/prescreen.ts'
import type { MailMessage } from '../runner/lib/smtp.ts'
import type { SourceConnector } from '../runner/lib/sources/types.ts'
import { createRunnerState } from '../runner/lib/state.ts'
import type { RunnerState } from '../runner/lib/state.ts'
import { startFakeJobApp } from './fakeJobApp.ts'
import type { FakeJobApp } from './fakeJobApp.ts'
import { fakeMailbox } from './fakeMailbox.ts'
import type { FakeMailbox } from './fakeMailbox.ts'
import { makeTempDir } from './tempDir.ts'

export const suitable: EvaluationOutcome = {
  kind: 'evaluated',
  transition: { to: 'suitable', evaluation: { verdict: 'suitable', fitSummary: 'Fits.', reasons: [] } },
}

const NOW = new Date(2026, 10, 20, 20, 0)

const promising: PrescreenOutcome = { kind: 'screened', prescreen: { verdict: 'promising', reason: 'Test work.' } }

const ON = { enabled: true, termsCheckedOn: '2026-11-23', dailyOpenCap: 20, minDelayMs: 1000 }

export interface Overrides {
  health?: HealthResult
  gate?: DailyRunOptions['gate']
  budget?: DailyRunOptions['budget']
  send?: DailyRunOptions['send']
  openMailbox?: DailyRunOptions['openMailbox']
  evaluate?: () => Promise<EvaluationOutcome>
  prescreen?: () => Promise<PrescreenOutcome>
  alwaysSend?: boolean
  lanUrl?: string
}

// A daily run against a fake job-app, recording each step it takes and each
// summary it sends.
export interface DailyRunFixture {
  fake: FakeJobApp
  state: RunnerState
  mailbox: FakeMailbox
  sent: MailMessage[]
  steps: string[]
  options: (overrides?: Overrides) => DailyRunOptions
  close: () => Promise<void>
}

// Sources that fetch: every page holds the same ad text. 'fetching' is a
// hand-over source fetching on request, 'auto' an automatic one fetching what
// the pre-screen calls promising.
function fetchingSource(steps: string[], id: string, mode: SourceConnector['mode']): SourceConnector {
  return {
    id,
    mode,
    fetchHosts: [`${id}.example`],
    matches: () => false,
    parseAlert: () => [],
    fetchAd: async () => (steps.push('fetch'), { kind: 'ok', text: 'The fetched ad.' }),
  }
}

function fixtureOptions(fixture: Omit<DailyRunFixture, 'options' | 'close'>, overrides: Overrides): DailyRunOptions {
  const { fake, state, mailbox, sent, steps } = fixture
  const jobApp = createJobAppClient({ baseUrl: fake.url, username: fake.username, password: fake.password, envPath: 'env' })
  const evaluation = { concurrency: 1, perRunCap: 1, timeoutMs: 1000 }
  return {
    jobApp,
    state,
    openMailbox: overrides.openMailbox ?? (async () => (steps.push('collect'), mailbox)),
    collect: { connectors: [], sources: {}, titleRules: [], today: '2026-11-20' },
    handoverWaitDays: 7,
    checkHealth: async () => (steps.push('health'), overrides.health ?? { ok: true }),
    gate: overrides.gate ?? (async () => (steps.push('gate'), { version: '9.9.9', reverified: false })),
    budget: overrides.budget,
    sync: null,
    prescreen: {
      config: { concurrency: 1, perRunCap: 10, timeoutMs: 1000 },
      prescreen: async () => (steps.push('prescreen'), await (overrides.prescreen ?? (async () => promising))()),
    },
    fetch: {
      connectors: [fetchingSource(steps, 'fetching', 'handover'), fetchingSource(steps, 'auto', 'automatic')],
      sources: { fetching: { ...ON, fetch: 'requested' }, auto: { ...ON, fetch: 'automatic' } },
      today: '2026-11-20',
      httpFor: () => ({ dayEnded: false, get: async () => ({ kind: 'gone' }) }),
    },
    evaluation: {
      config: { titleRules: { reject: [] }, evaluation },
      evaluate: overrides.evaluate ?? (async () => (steps.push('evaluate'), suitable)),
    },
    summary: {
      recipient: 'me@mail.example',
      alwaysSend: overrides.alwaysSend ?? false,
      appUrl: 'https://jobs.lan.example',
      lanUrl: overrides.lanUrl,
    },
    send: overrides.send ?? (async (message) => void (steps.push('send'), sent.push(message))),
    now: () => NOW,
  }
}

export async function startDailyRun(): Promise<DailyRunFixture> {
  const fake = await startFakeJobApp()
  const dir = makeTempDir()
  const parts = { fake, state: createRunnerState(dir.root), mailbox: fakeMailbox([]), sent: [], steps: [] }
  return {
    ...parts,
    options: (overrides = {}) => fixtureOptions(parts, overrides),
    close: async () => {
      dir.remove()
      await fake.close()
    },
  }
}
