// @vitest-environment node
import { expect, test } from 'vitest'
import { fakeAd } from '../../test/fakeJobAppAds.ts'
import { writeDraft } from './draft.ts'
import type { DraftOutput } from './draftOutput.ts'
import type { SandboxResult } from './sandbox.ts'

const evaluation = { verdict: 'suitable', fitSummary: 'Fits.', reasons: ['TypeScript'] }
const ad = fakeAd({ id: 1, state: 'suitable', body: 'Full ad text', evaluation })
const templates = { fi: 'CV-pohja', en: 'CV template' }

const valid: DraftOutput = {
  language: 'en',
  applicationType: 'portal',
  company: '',
  role: '',
  applyTo: '',
  fitSummary: 'Fits.',
  coverLetter: 'Because [[ASK:q1]].',
  cv: 'CV',
  questions: [{ id: 'q1', text: 'Why?' }],
}

function returning(result: SandboxResult) {
  const inputs: string[] = []
  const runStep = (input: string) => {
    inputs.push(input)
    return Promise.resolve(result)
  }
  return { inputs, runStep }
}

test('stdin carries the ad, its evaluation and both templates', async () => {
  const { inputs, runStep } = returning({ kind: 'ok', output: valid })
  await writeDraft(ad, templates, runStep)

  expect(JSON.parse(inputs[0])).toEqual({
    ad: {
      title: 'Developer 1',
      company: 'Example Oy',
      location: 'Helsinki',
      deadline: '',
      url: 'https://jobs.example/1',
      body: 'Full ad text',
    },
    evaluation: { fitSummary: 'Fits.', reasons: ['TypeScript'] },
    cvTemplates: templates,
  })
})

test('valid output is written', async () => {
  const { runStep } = returning({ kind: 'ok', output: valid })

  expect(await writeDraft(ad, templates, runStep)).toEqual({ kind: 'written', output: valid })
})

test('output failing the schema is invalid_result', async () => {
  const { runStep } = returning({ kind: 'ok', output: { ...valid, language: 'sv' } })

  expect(await writeDraft(ad, templates, runStep)).toEqual({ kind: 'failed', category: 'invalid_result' })
})

test('markers that differ from the questions are ask_mismatch', async () => {
  const { runStep } = returning({ kind: 'ok', output: { ...valid, coverLetter: 'No marker.' } })

  expect(await writeDraft(ad, templates, runStep)).toEqual({ kind: 'failed', category: 'ask_mismatch' })
})

test('a sandbox failure passes its category through', async () => {
  const { runStep } = returning({ kind: 'failed', category: 'timeout' })

  expect(await writeDraft(ad, templates, runStep)).toEqual({ kind: 'failed', category: 'timeout' })
})
