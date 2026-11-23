import { z } from 'zod'
import type { AdPrescreen, AdSummary } from './jobApp.ts'
import { stepSchema } from './sandbox.ts'
import type { FailureCategory } from './sandbox.ts'
import type { RunStep } from './evaluate.ts'

const outputSchema = z.object({
  verdict: z.enum(['promising', 'not_promising', 'unsure']),
  reason: z.string().min(1).max(300),
})

export const PRESCREEN_SCHEMA = stepSchema(outputSchema)
export const PRESCREEN_PROMPT = 'Pre-screen the job ad given on standard input.'

export const PRESCREEN_FRAMING = new URL('../prompts/prescreen.framing.md', import.meta.url)

export type PrescreenOutcome =
  | { kind: 'screened'; prescreen: AdPrescreen }
  | { kind: 'failed'; category: FailureCategory | 'invalid_result' }

// The alert carries only these four fields; there is no description to judge.
export function prescreenInput(ad: AdSummary): string {
  const { title, company, location, deadline } = ad
  return JSON.stringify({ title, company, location, deadline })
}

// Unsure counts as promising, as in evaluation.
function toPrescreen({ verdict, reason }: z.infer<typeof outputSchema>): AdPrescreen {
  return { verdict: verdict === 'unsure' ? 'promising' : verdict, reason }
}

// The CLI checks the schema; the runner checks it again before acting on it.
export async function prescreenAd(ad: AdSummary, runStep: RunStep): Promise<PrescreenOutcome> {
  const result = await runStep(prescreenInput(ad))
  if (result.kind === 'failed') return result
  const parsed = outputSchema.safeParse(result.output)
  if (!parsed.success) return { kind: 'failed', category: 'invalid_result' }
  return { kind: 'screened', prescreen: toPrescreen(parsed.data) }
}
