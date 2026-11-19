// @vitest-environment node
import { expect, test } from 'vitest'
import { fakeAd } from '../../test/fakeJobAppAds.ts'
import { EVALUATION_FRAMING, UNSURE_REASON, evaluateAd } from './evaluate.ts'
import { buildSystemPrompt } from './prompts.ts'
import type { SandboxResult } from './sandbox.ts'

const ad = { ...fakeAd({ id: 1, state: 'ready', body: 'Full ad text' }) }

function returning(result: SandboxResult) {
  const inputs: string[] = []
  const runStep = (input: string) => {
    inputs.push(input)
    return Promise.resolve(result)
  }
  return { inputs, runStep }
}

test.each(['suitable', 'unsuitable'] as const)('a %s verdict passes through', async (verdict) => {
  const output = { verdict, fitSummary: 'Fits well.', reasons: ['TypeScript'] }
  const { runStep } = returning({ kind: 'ok', output })

  expect(await evaluateAd(ad, runStep)).toEqual({ kind: 'evaluated', transition: { to: verdict, evaluation: output } })
})

test('unsure becomes suitable with the fixed reason first', async () => {
  const { runStep } = returning({ kind: 'ok', output: { verdict: 'unsure', fitSummary: 'Maybe.', reasons: ['Is Go required?'] } })

  expect(await evaluateAd(ad, runStep)).toEqual({
    kind: 'evaluated',
    transition: {
      to: 'suitable',
      evaluation: { verdict: 'suitable', fitSummary: 'Maybe.', reasons: [UNSURE_REASON, 'Is Go required?'] },
    },
  })
})

test.each([
  ['an unknown verdict', { verdict: 'maybe', fitSummary: '', reasons: [] }],
  ['a missing field', { verdict: 'suitable', fitSummary: '' }],
  ['too many reasons', { verdict: 'suitable', fitSummary: '', reasons: new Array(11).fill('r') }],
])('%s is invalid_result', async (_name, output) => {
  const { runStep } = returning({ kind: 'ok', output })

  expect(await evaluateAd(ad, runStep)).toEqual({ kind: 'failed', category: 'invalid_result' })
})

test('a step failure passes its category through', async () => {
  const { runStep } = returning({ kind: 'failed', category: 'timeout' })

  expect(await evaluateAd(ad, runStep)).toEqual({ kind: 'failed', category: 'timeout' })
})

test('the step reads the ad fields and body as JSON on stdin', async () => {
  const { inputs, runStep } = returning({ kind: 'failed', category: 'timeout' })
  await evaluateAd(ad, runStep)

  expect(JSON.parse(inputs[0])).toEqual({
    title: 'Developer 1',
    company: 'Example Oy',
    location: 'Helsinki',
    deadline: '',
    url: 'https://jobs.example/1',
    body: 'Full ad text',
  })
})

test('the system prompt puts the fixed framing before the private criteria', () => {
  const prompt = buildSystemPrompt(EVALUATION_FRAMING, 'Criteria: remote work.')

  expect(prompt.indexOf('untrusted')).toBeGreaterThan(-1)
  expect(prompt.indexOf('untrusted')).toBeLessThan(prompt.indexOf('Criteria: remote work.'))
})
