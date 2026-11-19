import { z } from 'zod'

export const draftOutputSchema = z.object({
  language: z.enum(['fi', 'en']),
  applicationType: z.enum(['portal', 'email']),
  company: z.string().max(200),
  role: z.string().max(200),
  applyTo: z.string().max(200),
  fitSummary: z.string().max(2000),
  coverLetter: z.string().max(20000),
  cv: z.string().max(40000),
  questions: z.array(z.object({ id: z.string().regex(/^q[0-9]{1,2}$/), text: z.string().max(500) })).max(20),
})

export type DraftOutput = z.infer<typeof draftOutputSchema>

// Any id at all, so a malformed marker still counts as a mismatch.
const MARKER = /\[\[ASK:(.*?)\]\]/g

function markerIds({ coverLetter, cv }: DraftOutput): Set<string> {
  return new Set([...`${coverLetter}\n${cv}`.matchAll(MARKER)].map((match) => match[1]))
}

// Every question appears in the text, and every marker has its question.
export function checkDraft(output: DraftOutput): 'ok' | 'ask_mismatch' {
  const ids = output.questions.map((question) => question.id)
  const questionIds = new Set(ids)
  const markers = markerIds(output)
  if (questionIds.size !== ids.length || markers.size !== questionIds.size) return 'ask_mismatch'
  return ids.every((id) => markers.has(id)) ? 'ok' : 'ask_mismatch'
}
