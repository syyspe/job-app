/** Answers by question id, already trimmed and non-blank. */
export type Answers = Record<string, string>

const MARKER = /\[\[ASK:(q[0-9]{1,2})\]\]/g
const QUESTION_LINE = /^(q[0-9]{1,2}):\s*(.*)$/

function questionNumber(id: string): number {
  return Number(id.slice(1))
}

export function openQuestionIds(text: string): string[] {
  const ids = new Set(Array.from(text.matchAll(MARKER), (match) => match[1]))
  return [...ids].sort((a, b) => questionNumber(a) - questionNumber(b))
}

export function fillAnswers(text: string, answers: Answers): string {
  return text.replace(MARKER, (marker, id: string) => answers[id] ?? marker)
}

export function questionTexts(notes: string): Map<string, string> {
  const texts = new Map<string, string>()
  for (const line of notes.split('\n')) {
    const match = QUESTION_LINE.exec(line)
    if (match && !texts.has(match[1])) texts.set(match[1], match[2].trim())
  }
  return texts
}

function appendLine(notes: string, line: string): string {
  if (notes === '' || notes.endsWith('\n')) return notes + line
  return `${notes}\n${line}`
}

function markOne(notes: string, id: string, answer: string): string {
  const lines = notes.split('\n')
  const index = lines.findIndex((line) => QUESTION_LINE.exec(line)?.[1] === id)
  if (index === -1) return appendLine(notes, `${id} → ${answer}`)

  lines.splice(index + 1, 0, `→ ${answer}`)
  return lines.join('\n')
}

export function markAnswered(notes: string, answers: Answers): string {
  return Object.entries(answers).reduce((text, [id, answer]) => markOne(text, id, answer), notes)
}

export function isMarkdown(name: string): boolean {
  return name.toLowerCase().endsWith('.md')
}

export function editedName(name: string): string {
  return `${name.slice(0, -'.md'.length)} (edited).md`
}
