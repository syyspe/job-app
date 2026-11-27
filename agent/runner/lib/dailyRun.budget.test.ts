// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { startDailyRun, suitable } from '../../test/dailyRunFixture.ts'
import type { DailyRunFixture } from '../../test/dailyRunFixture.ts'
import { fakeAd } from '../../test/fakeJobAppAds.ts'
import { memoryLedger } from '../../test/memoryLedger.ts'
import { CliError } from '../../lib/cliError.ts'
import { createRunBudget } from './apiBudget.ts'
import { runDaily } from './dailyRun.ts'

// The daily run under a Claude API budget: run and month caps, and spend.
let fixture: DailyRunFixture

beforeEach(async () => {
  fixture = await startDailyRun()
})

afterEach(async () => {
  await fixture.close()
})

test('a budget stopping mid-evaluation starts no further step and the summary names it', async () => {
  fixture.fake.ads.push(
    fakeAd({ id: 1, state: 'ready', firstSeenAt: '2026-11-20 08:00:00' }),
    fakeAd({ id: 2, state: 'ready', firstSeenAt: '2026-11-20 09:00:00' }),
  )
  const budget = createRunBudget({ perRunUsd: 3, monthlyUsd: 30, prices: {}, ledger: memoryLedger() })
  const evaluate = async () => {
    fixture.steps.push('evaluate')
    budget.stop('API run cap reached at $3.00')
    return suitable
  }
  const opts = fixture.options({ budget, evaluate })
  opts.evaluation.config.evaluation.perRunCap = 2

  const report = await runDaily(opts)

  expect(fixture.steps).toEqual(['collect', 'health', 'gate', 'evaluate', 'send'])
  expect(report.evaluation?.queued).toBe(1)
  expect(report.stopped).toEqual({ step: 'model steps', message: 'API run cap reached at $3.00' })
  expect(report.failures).toEqual([])
  expect(fixture.fake.ads.map((ad) => [ad.state, ad.attempts])).toEqual([['suitable', 0], ['ready', 0]])
  expect(fixture.sent[0].text).toContain('Stopped before the remaining model steps: API run cap reached at $3.00')
})

const price = { inputPerMTok: 1, outputPerMTok: 1, cacheWritePerMTok: 1, cacheReadPerMTok: 1 }
const MILLION_TOKENS = { input_tokens: 1_000_000, output_tokens: 0, cache_creation_input_tokens: null, cache_read_input_tokens: null }

test('the report carries the API spend and the summary shows it', async () => {
  fixture.fake.ads.push(fakeAd({ id: 1, state: 'ready', firstSeenAt: '2026-11-20 08:00:00' }))
  const budget = createRunBudget({ perRunUsd: 3, monthlyUsd: 30, prices: { m: price }, ledger: memoryLedger(4) })
  const evaluate = async () => {
    budget.charge('m', MILLION_TOKENS)
    return suitable
  }

  const report = await runDaily(fixture.options({ budget, evaluate }))

  expect(report.apiSpend).toEqual({ runUsd: 1, monthUsd: 5, monthlyUsd: 30 })
  expect(fixture.sent[0].text).toContain('Claude API: $1.00 this run, $5.00 of $30.00 this month.')
})

test('an invalid spend ledger fails the model steps but the summary still goes out', async () => {
  fixture.fake.ads.push(fakeAd({ id: 1, state: 'ready', firstSeenAt: '2026-11-20 08:00:00' }))
  const invalid = () => {
    throw new CliError(2, 'api-spend.json: not a valid state file; fix or delete it')
  }
  const ledger = { monthTotal: invalid, add: invalid }
  const budget = createRunBudget({ perRunUsd: 3, monthlyUsd: 30, prices: {}, ledger })

  const report = await runDaily(fixture.options({ budget }))

  expect(report.failures.map(({ step }) => step)).toContain('API spend')
  expect(report.apiSpend).toBeNull()
  expect(fixture.sent[0].text).toContain('Spend check failed: api-spend.json: not a valid state file; fix or delete it')
})

test('a month already at its cap starts no model step and the summary names it', async () => {
  fixture.fake.ads.push(fakeAd({ id: 1, state: 'ready', firstSeenAt: '2026-11-20 08:00:00' }))
  const budget = createRunBudget({ perRunUsd: 3, monthlyUsd: 30, prices: {}, ledger: memoryLedger(30) })

  const report = await runDaily(fixture.options({ budget }))

  expect(fixture.steps).toEqual(['collect', 'health', 'gate', 'send'])
  expect(report.stopped).toEqual({ step: 'model steps', message: 'API monthly cap reached: $30.00 of $30.00' })
  expect(report.apiSpend).toBeNull()
  expect(report.failures).toEqual([])
  expect(fixture.sent[0].text).toContain('Stopped before the remaining model steps: API monthly cap reached: $30.00 of $30.00')
})
