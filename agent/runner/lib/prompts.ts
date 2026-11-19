import { readFileSync } from 'node:fs'

// The fixed framing first, so the private rules cannot override it.
export function buildSystemPrompt(framing: URL, rules: string): string {
  return `${readFileSync(framing, 'utf8').trim()}\n\n${rules.trim()}\n`
}
