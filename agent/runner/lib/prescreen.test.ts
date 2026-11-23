// @vitest-environment node
import { expect, test } from 'vitest'
import { fakeAd } from '../../test/fakeJobAppAds.ts'
import { PRESCREEN_FRAMING, prescreenAd } from './prescreen.ts'
import { buildSystemPrompt } from './prompts.ts'
import type { SandboxResult } from './sandbox.ts'

const ad = fakeAd({ id: 1, sourceMode: 'handover', state: 'awaiting_handover', deadline: '2026-12-02' })

function returning(result: SandboxResult) {
  const inputs: string[] = []
  const runStep = (input: string) => {
    inputs.push(input)
    return Promise.resolve(result)
  }
  return { inputs, runStep }
}

test.each(['promising', 'not_promising'] as const)('a %s verdict passes through', async (verdict) => {
  const { runStep } = returning({ kind: 'ok', output: { verdict, reason: 'The title fits.' } })

  expect(await prescreenAd(ad, runStep)).toEqual({ kind: 'screened', prescreen: { verdict, reason: 'The title fits.' } })
})

test('unsure is stored as promising', async () => {
  const { runStep } = returning({ kind: 'ok', output: { verdict: 'unsure', reason: 'Unclear title.' } })

  expect(await prescreenAd(ad, runStep)).toEqual({
    kind: 'screened',
    prescreen: { verdict: 'promising', reason: 'Unclear title.' },
  })
})

test.each([
  ['an unknown verdict', { verdict: 'maybe', reason: 'Why.' }],
  ['an empty reason', { verdict: 'promising', reason: '' }],
  ['an over-long reason', { verdict: 'promising', reason: 'x'.repeat(301) }],
  ['a missing reason', { verdict: 'promising' }],
])('%s is invalid_result', async (_name, output) => {
  const { runStep } = returning({ kind: 'ok', output })

  expect(await prescreenAd(ad, runStep)).toEqual({ kind: 'failed', category: 'invalid_result' })
})

test('a step failure passes its category through', async () => {
  const { runStep } = returning({ kind: 'failed', category: 'cli_failed' })

  expect(await prescreenAd(ad, runStep)).toEqual({ kind: 'failed', category: 'cli_failed' })
})

test('the step reads only title, company, location and deadline', async () => {
  const { inputs, runStep } = returning({ kind: 'failed', category: 'timeout' })
  await prescreenAd(ad, runStep)

  expect(JSON.parse(inputs[0])).toEqual({
    title: 'Developer 1',
    company: 'Example Oy',
    location: 'Helsinki',
    deadline: '2026-12-02',
  })
})

test('the system prompt puts the fixed framing before the private criteria', () => {
  const prompt = buildSystemPrompt(PRESCREEN_FRAMING, 'Criteria: remote work.')

  expect(prompt.indexOf('untrusted')).toBeGreaterThan(-1)
  expect(prompt.indexOf('untrusted')).toBeLessThan(prompt.indexOf('Criteria: remote work.'))
})
