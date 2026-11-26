// Ad text and API messages are untrusted: control characters and line breaks
// become spaces, so a value can never start a line of its own.
export function oneLine(value: string): string {
  return value.replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ')
}
