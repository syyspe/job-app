// The locale is pinned rather than left to the machine so output is deterministic.
const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const TIME = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDate(isoDate: string): string {
  // The time suffix forces local-time parsing; a bare date is parsed as UTC.
  return DATE.format(new Date(`${isoDate}T00:00:00`))
}

export function formatTimestamp(sqliteTimestamp: string): string {
  const at = new Date(sqliteTimestamp.replace(' ', 'T'))
  return `${DATE.format(at)}, ${TIME.format(at)}`
}
