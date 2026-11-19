import type { RunStep } from './evaluate.ts'
import { checkDraft, draftOutputSchema } from './draftOutput.ts'
import type { DraftOutput } from './draftOutput.ts'
import type { Ad } from './jobApp.ts'
import { stepSchema } from './sandbox.ts'
import type { FailureCategory } from './sandbox.ts'

export const DRAFT_SCHEMA = stepSchema(draftOutputSchema)
export const DRAFT_PROMPT = 'Draft the application for the job ad given on standard input.'
export const DRAFT_FRAMING = new URL('../prompts/draft.framing.md', import.meta.url)

// The two master CV templates, whole: search chunks cannot rebuild them.
export interface CvTemplates {
  fi: string
  en: string
}

export type DraftFailure = FailureCategory | 'invalid_result' | 'ask_mismatch'

export type DraftOutcome = { kind: 'written'; output: DraftOutput } | { kind: 'failed'; category: DraftFailure }

export function draftInput(ad: Ad, cvTemplates: CvTemplates): string {
  const { title, company, location, deadline, url, body } = ad
  const { fitSummary, reasons } = ad.evaluation ?? { fitSummary: '', reasons: [] }
  return JSON.stringify({
    ad: { title, company, location, deadline, url, body },
    evaluation: { fitSummary, reasons },
    cvTemplates,
  })
}

// The CLI checks the schema; the runner checks it again, and the markers too.
export async function writeDraft(ad: Ad, cvTemplates: CvTemplates, runStep: RunStep): Promise<DraftOutcome> {
  const result = await runStep(draftInput(ad, cvTemplates))
  if (result.kind === 'failed') return result
  const parsed = draftOutputSchema.safeParse(result.output)
  if (!parsed.success) return { kind: 'failed', category: 'invalid_result' }
  if (checkDraft(parsed.data) === 'ask_mismatch') return { kind: 'failed', category: 'ask_mismatch' }
  return { kind: 'written', output: parsed.data }
}
