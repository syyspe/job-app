// @vitest-environment node
import { expect, test } from 'vitest'
import { checkDraft, draftOutputSchema } from './draftOutput.ts'
import type { DraftOutput } from './draftOutput.ts'

function output(fields: Partial<DraftOutput> = {}): DraftOutput {
  return {
    language: 'en',
    applicationType: 'portal',
    company: 'Example Oy',
    role: 'Test Lead',
    applyTo: '',
    fitSummary: 'Fits.',
    coverLetter: 'I want to join because [[ASK:q1]].',
    cv: 'Experience: [[ASK:q2]]',
    questions: [
      { id: 'q1', text: 'Why this company?' },
      { id: 'q2', text: 'Which years at Example?' },
    ],
    ...fields,
  }
}

test('markers split across the cover letter and the CV match their questions', () => {
  expect(checkDraft(output())).toBe('ok')
})

test('no markers and no questions is ok', () => {
  expect(checkDraft(output({ coverLetter: 'Plain.', cv: 'Plain.', questions: [] }))).toBe('ok')
})

test('a marker repeated in both texts counts once', () => {
  expect(checkDraft(output({ cv: 'Again [[ASK:q1]] and [[ASK:q2]]' }))).toBe('ok')
})

test.each([
  ['a marker without a question', output({ cv: '[[ASK:q2]] [[ASK:q3]]' })],
  ['a question without a marker', output({ cv: 'No marker.' })],
  ['duplicate question ids', output({ cv: '[[ASK:q1]]', questions: [{ id: 'q1', text: 'a' }, { id: 'q1', text: 'b' }] })],
  ['a marker with a malformed id', output({ cv: '[[ASK:q2]] [[ASK:why]]' })],
])('%s is ask_mismatch', (_name, draft) => {
  expect(checkDraft(draft)).toBe('ask_mismatch')
})

test('a malformed question id fails the schema', () => {
  const parsed = draftOutputSchema.safeParse(output({ questions: [{ id: 'question-1', text: 'Why?' }] }))

  expect(parsed.success).toBe(false)
})
