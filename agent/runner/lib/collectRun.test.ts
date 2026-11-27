// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { startFakeJobApp } from '../../test/fakeJobApp.ts'
import type { FakeJobApp } from '../../test/fakeJobApp.ts'
import { fakeMailbox } from '../../test/fakeMailbox.ts'
import { alert, fixture } from '../../test/fakeSources.ts'
import { makeTempDir } from '../../test/tempDir.ts'
import type { TempDir } from '../../test/tempDir.ts'
import { formatCollectReport, runCollect } from './collectRun.ts'
import { createJobAppClient } from './jobApp.ts'
import type { SourcesConfig } from './runnerConfig.ts'
import { duunitori } from './sources/duunitori.ts'
import { linkOn } from './sources/common.ts'
import type { AlertMessage, SourceConnector } from './sources/types.ts'
import { createRunnerState } from './state.ts'

let fake: FakeJobApp
let dir: TempDir

beforeEach(async () => {
  fake = await startFakeJobApp()
  dir = makeTempDir()
})

afterEach(async () => {
  dir.remove()
  await fake.close()
})

// A test source: from `<id>@alerts.example`, one candidate per text line
// "externalId title". Its fetchAd must never be called by collect.
function testConnector(id: string): SourceConnector {
  return {
    id,
    mode: 'automatic',
    fetchHosts: [`${id}.example`],
    matches: (message) => message.from === `${id}@alerts.example`,
    parseAlert: (message) =>
      message.text
        .split('\n')
        .filter((line) => line.includes(' '))
        .map((line) => {
          const [externalId, ...title] = line.split(' ')
          return { externalId, url: `https://${id}.example/ad/${externalId}`, title: title.join(' ') }
        })
        .filter((candidate) => linkOn(candidate.url, [`${id}.example`])),
    fetchAd: () => {
      throw new Error('collect fetched a page')
    },
  }
}

const alpha = testConnector('alpha')
const beta = testConnector('beta')

function message(uid: number, source: string, lines: string[]): AlertMessage {
  return alert({ uid, from: `${source}@alerts.example`, text: lines.join('\n') })
}

const ON = { enabled: true, termsCheckedOn: '2026-11-01', dailyOpenCap: 20, minDelayMs: 1000, fetch: 'requested' as const }
const OFF = { enabled: false, dailyOpenCap: 20, minDelayMs: 1000, fetch: 'requested' as const }

interface RunSetup {
  messages: AlertMessage[]
  sources?: SourcesConfig
  connectors?: SourceConnector[]
  uidValidity?: number
}

function run(setup: RunSetup) {
  const state = createRunnerState(dir.root)
  const mailbox = fakeMailbox(setup.messages, setup.uidValidity)
  const result = runCollect({
    mailbox,
    jobApp: createJobAppClient({ baseUrl: fake.url, username: fake.username, password: fake.password, envPath: 'env' }),
    connectors: setup.connectors ?? [alpha, beta],
    sources: setup.sources ?? { alpha: ON, beta: ON },
    titleRules: ['trainee'],
    state,
    today: '2026-11-20',
  })
  return { result, state, mailbox }
}

test('collects and screens without fetching, advancing the watermark per message', async () => {
  const { result, state } = run({
    messages: [message(5, 'alpha', ['a1 Tester', 'a2 Trainee tester']), message(7, 'alpha', ['a1 Tester'])],
    sources: { alpha: ON, beta: OFF },
  })

  const report = await result

  expect(state.readWatermark()).toEqual({ uidValidity: 1, lastUid: 7 })
  expect(report.sources).toEqual({
    alpha: { messages: 2, newAds: 2, existingAds: 1, emptyAlerts: 0 },
  })
  expect(report.screened).toEqual({ titleRejected: 1, awaitingHandover: 0, leftNew: 1 })
  expect(fake.ads.map((ad) => [ad.externalId, ad.state])).toEqual([
    ['a1', 'new'],
    ['a2', 'title_rejected'],
  ])
})

test('the report reads as one plain sentence', () => {
  const source = { messages: 1, newAds: 7, existingAds: 2, emptyAlerts: 0 }
  const screened = { titleRejected: 0, awaitingHandover: 0, leftNew: 0 }

  expect(formatCollectReport({ sources: { alpha: source, beta: { ...source, newAds: 0 } }, screened })).toBe(
    'Read 2 new emails with 7 new job titles.',
  )
  expect(formatCollectReport({ sources: { alpha: { ...source, newAds: 1 } }, screened })).toBe(
    'Read 1 new email with 1 new job title.',
  )
})

test('the next run reads only after the watermark', async () => {
  const messages = [message(5, 'alpha', ['a1 Tester'])]
  await run({ messages }).result

  const { result, mailbox } = run({ messages: [...messages, message(9, 'alpha', ['a2 Tester'])] })
  await result

  expect(mailbox.reads).toEqual([5])
})

test('an ingest failure stops the run with the watermark before that message', async () => {
  fake.ingestFailsFor = 'b2'
  const { result, state } = run({
    messages: [message(5, 'alpha', ['a1 Tester']), message(6, 'beta', ['b1 Tester', 'b2 Tester']), message(7, 'alpha', ['a3 Tester'])],
  })

  await expect(result).rejects.toMatchObject({ exitCode: 1 })
  expect(state.readWatermark()).toEqual({ uidValidity: 1, lastUid: 5 })
  expect(fake.ads.map((ad) => ad.externalId)).toEqual(['a1', 'b1'])
})

test('a disabled source is not ingested, but its message is passed', async () => {
  const { result, state } = run({ messages: [message(5, 'beta', ['b1 Tester'])], sources: { alpha: ON, beta: OFF } })

  const report = await result

  expect(fake.ads).toEqual([])
  expect(state.readWatermark().lastUid).toBe(5)
  expect(report.sources.beta).toBeUndefined()
})

test('a changed UIDVALIDITY rescans from the start', async () => {
  createRunnerState(dir.root).writeWatermark({ uidValidity: 1, lastUid: 50 })

  const { result, mailbox, state } = run({ messages: [message(3, 'alpha', ['a1 Tester'])], uidValidity: 2 })
  await result

  expect(mailbox.reads).toEqual([0])
  expect(state.readWatermark()).toEqual({ uidValidity: 2, lastUid: 3 })
})

test('an empty alert is counted and recorded as a source failure', async () => {
  const { result, state } = run({ messages: [message(5, 'alpha', ['unparseable'])] })

  expect((await result).sources.alpha.emptyAlerts).toBe(1)
  expect(state.readFailures()).toEqual([{ source: 'alpha', date: '2026-11-20', kind: 'empty_alert' }])
})

test('Duunitori ads go to awaiting_handover with no request made', async () => {
  const duunitoriAlert = alert({
    uid: 5,
    from: 'duunivahti@duunitori.fi',
    subject: 'Duunitori löysi sinulle 3 työpaikkaa',
    date: '2026-11-19T16:19:06.000Z',
    html: fixture('duunitori-alert.html'),
  })
  const sources = { alpha: OFF, duunitori: { ...OFF, enabled: true } }

  const report = await run({ messages: [duunitoriAlert], sources, connectors: [alpha, duunitori] }).result

  expect(report.sources.duunitori).toMatchObject({ messages: 1, newAds: 3 })
  expect(report.screened.awaitingHandover).toBe(3)
  expect(fake.ads.map((ad) => [ad.sourceMode, ad.state])).toEqual([
    ['handover', 'awaiting_handover'],
    ['handover', 'awaiting_handover'],
    ['handover', 'awaiting_handover'],
  ])
})
