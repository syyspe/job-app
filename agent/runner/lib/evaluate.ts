import { z } from 'zod'
import type { Ad } from './jobApp.ts'
import { stepSchema } from './sandbox.ts'
import type { FailureCategory, SandboxResult } from './sandbox.ts'

const outputSchema = z.object({
  verdict: z.enum(['suitable', 'unsuitable', 'unsure']),
  fitSummary: z.string().max(2000),
  reasons: z.array(z.string()).max(10),
})

export const EVALUATION_SCHEMA = stepSchema(outputSchema)
export const EVALUATION_PROMPT = 'Evaluate the job ad given on standard input.'
export const UNSURE_REASON = 'Evaluation was unsure: the points below are open questions.'

export const EVALUATION_FRAMING = new URL('../prompts/evaluate.framing.md', import.meta.url)

export interface EvaluationTransition {
  to: 'suitable' | 'unsuitable'
  evaluation: { verdict: 'suitable' | 'unsuitable'; fitSummary: string; reasons: string[] }
}

export type EvaluationOutcome =
  | { kind: 'evaluated'; transition: EvaluationTransition }
  | { kind: 'failed'; category: FailureCategory | 'invalid_result' }

export type RunStep = (input: string) => Promise<SandboxResult>

export function adInput(ad: Ad): string {
  const { title, company, location, deadline, url, body } = ad
  return JSON.stringify({ title, company, location, deadline, url, body })
}

// Unsure counts as suitable; its doubts become the draft's questions.
function toTransition({ verdict, fitSummary, reasons }: z.infer<typeof outputSchema>): EvaluationTransition {
  if (verdict === 'unsure') {
    return { to: 'suitable', evaluation: { verdict: 'suitable', fitSummary, reasons: [UNSURE_REASON, ...reasons] } }
  }
  return { to: verdict, evaluation: { verdict, fitSummary, reasons } }
}

// The CLI checks the schema; the runner checks it again before acting on it.
export async function evaluateAd(ad: Ad, runStep: RunStep): Promise<EvaluationOutcome> {
  const result = await runStep(adInput(ad))
  if (result.kind === 'failed') return result
  const parsed = outputSchema.safeParse(result.output)
  if (!parsed.success) return { kind: 'failed', category: 'invalid_result' }
  return { kind: 'evaluated', transition: toTransition(parsed.data) }
}
