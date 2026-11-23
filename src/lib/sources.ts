const SOURCE_LABELS: Record<string, string> = {
  duunitori: 'Duunitori',
  academicwork: 'Academic Work',
  nordea: 'Nordea',
  valtiolle: 'Valtiolle',
}

/** An unknown source, such as a hand-over one, reads as its own slug. */
export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source
}
