// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { startFakeJobApp } from '../../test/fakeJobApp.ts'
import type { FakeJobApp } from '../../test/fakeJobApp.ts'
import { fakeMailbox } from '../../test/fakeMailbox.ts'
import { alert, fixture } from '../../test/fakeSources.ts'
import { makeTempDir } from '../../test/tempDir.ts'
import type { TempDir } from '../../test/tempDir.ts'
import { runCollect } from './collectRun.ts'
import { createJobAppClient } from './jobApp.ts'
import { createPoliteHttp } from './politeHttp.ts'
import type { SourcesConfig } from './runnerConfig.ts'
import { duunitori } from './sources/duunitori.ts'
import { fetchAdPage, linkOn } from './sources/common.ts'
import type { AlertMessage, SourceConnector } from './sources/types.ts'
import { createRunnerState } from './state.ts'

let fake: FakeJobApp
let dir: TempDir
let pages: Map<string, number | string>
let requested: string[]

beforeEach(async () => {
  fake = await startFakeJobApp()
  dir = makeTempDir()
  pages = new Map()
  requested = []
})

afterEach(async () => {
  dir.remove()
  await fake.close()
})

// A test source: from `<id>@alerts.example`, one candidate per text line
// "externalId title", pages on `<id>.example` with their text in <main>.
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
    fetchAd: (candidate, http) =>
      fetchAdPage(candidate.url, http, (html) => {
        const text = /<main>(.*)<\/main>/.exec(html)?.[1]
        return text ? { text, company: 'Page Oy' } : null
      }),
  }
}

const alpha = testConnector('alpha')
const beta = testConnector('beta')

function message(uid: number, source: string, lines: string[]): AlertMessage {
  return alert({ uid, from: `${source}@alerts.example`, text: lines.join('\n') })
}

function fakeFetch(url: string | URL | Request): Promise<Response> {
  requested.push(String(url))
  const page = pages.get(String(url)) ?? 404
  if (typeof page === 'number') return Promise.resolve(new Response(null, { status: page }))
  return Promise.resolve(new Response(`<main>${page}</main>`, { status: 200 }))
}

const ON = { enabled: true, termsCheckedOn: '2026-11-01', dailyOpenCap: 20, minDelayMs: 1000 }
const OFF = { enabled: false, dailyOpenCap: 20, minDelayMs: 1000 }

interface RunSetup {
  messages: AlertMessage[]
  sources?: SourcesConfig
  connectors?: SourceConnector[]
  uidValidity?: number
}

function run(setup: RunSetup) {
  const state = createRunnerState(dir.root)
  const mailbox = fakeMailbox(setup.messages, setup.uidValidity)
  const counters = state.counters('2026-11-20')
  const result = runCollect({
    mailbox,
    jobApp: createJobAppClient({ baseUrl: fake.url, username: fake.username, password: fake.password, envPath: 'env' }),
    connectors: setup.connectors ?? [alpha, beta],
    sources: setup.sources ?? { alpha: ON, beta: ON },
    titleRules: ['trainee'],
    state,
    today: '2026-11-20',
    httpFor: (connector) =>
      createPoliteHttp({
        sourceId: connector.id,
        hosts: connector.fetchHosts ?? [],
        ...(setup.sources ?? { alpha: ON, beta: ON })[connector.id],
        counters,
        fetch: fakeFetch,
        now: () => 0,
        sleep: () => Promise.resolve(),
      }),
  })
  return { result, state, mailbox }
}

test('collects, screens and fetches, advancing the watermark per message', async () => {
  pages.set('https://alpha.example/ad/a1', 'Ad one text')
  const { result, state } = run({
    messages: [message(5, 'alpha', ['a1 Tester', 'a2 Trainee tester']), message(7, 'alpha', ['a1 Tester'])],
    sources: { alpha: ON, beta: OFF },
  })

  const report = await result

  expect(state.readWatermark()).toEqual({ uidValidity: 1, lastUid: 7 })
  expect(report.sources).toEqual({
    alpha: { messages: 2, newAds: 2, existingAds: 1, emptyAlerts: 0, fetched: expect.objectContaining({ ready: 1 }) },
  })
  expect(report.screened).toEqual({ titleRejected: 1, awaitingHandover: 0, leftNew: 1 })
  expect(report.leftNew).toBe(0)
  expect(fake.ads.map((ad) => [ad.externalId, ad.state, ad.body, ad.company])).toEqual([
    ['a1', 'ready', 'Ad one text', 'Page Oy'],
    ['a2', 'title_rejected', null, ''],
  ])
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

test('a blocked source leaves its ads new with no attempt, and the other source keeps fetching', async () => {
  pages.set('https://alpha.example/ad/a1', 429)
  pages.set('https://beta.example/ad/b1', 'Beta one')
  pages.set('https://beta.example/ad/b2', 'Beta two')
  const { result, state } = run({ messages: [message(5, 'alpha', ['a1 Tester', 'a2 Tester']), message(6, 'beta', ['b1 Tester', 'b2 Tester'])] })

  const report = await result

  expect(report.sources.alpha.fetched.blocked).toBe(1)
  expect(report.sources.beta.fetched.ready).toBe(2)
  expect(fake.ads.filter((ad) => ad.source === 'alpha').map((ad) => [ad.state, ad.attempts])).toEqual([
    ['new', 0],
    ['new', 0],
  ])
  expect(requested.filter((url) => url.includes('alpha'))).toEqual(['https://alpha.example/ad/a1'])
  expect(state.readFailures()).toEqual([{ source: 'alpha', date: '2026-11-20', kind: 'blocked' }])
})

test('a block is recorded once per source per day', async () => {
  pages.set('https://alpha.example/ad/a1', 503)
  await run({ messages: [message(5, 'alpha', ['a1 Tester'])] }).result
  pages.set('https://alpha.example/ad/a1', 'Now open')

  const { result, state } = run({ messages: [] })
  await result

  expect(state.readFailures()).toHaveLength(1)
  expect(fake.ads[0].state).toBe('new')
})

test('a gone page fails the ad with gone', async () => {
  pages.set('https://alpha.example/ad/a1', 410)

  expect((await run({ messages: [message(5, 'alpha', ['a1 Tester'])] }).result).sources.alpha.fetched.gone).toBe(1)
  expect(fake.ads[0]).toMatchObject({ state: 'failed', lastError: 'gone' })
})

test('a failed fetch records an attempt and the ad stays new', async () => {
  pages.set('https://alpha.example/ad/a1', 500)

  expect((await run({ messages: [message(5, 'alpha', ['a1 Tester'])] }).result).sources.alpha.fetched.retrying).toBe(1)
  expect(fake.ads[0]).toMatchObject({ state: 'new', attempts: 1, lastError: 'http_error' })
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
  expect(requested).toEqual([])
})
