const MAX_CHUNK = 1500

// Cuts a paragraph longer than MAX_CHUNK at its last whitespace that fits,
// or hard at MAX_CHUNK when a run of text has no whitespace at all.
function cutLong(paragraph: string): string[] {
  const pieces: string[] = []
  let rest = paragraph
  while (rest.length > MAX_CHUNK) {
    const space = rest.slice(0, MAX_CHUNK + 1).search(/\s\S*$/)
    const at = space > 0 ? space : MAX_CHUNK
    pieces.push(rest.slice(0, at).trim())
    rest = rest.slice(at).trim()
  }
  pieces.push(rest)
  return pieces
}

// Splits on blank lines and packs whole paragraphs into chunks of at most
// MAX_CHUNK characters.
export function chunkText(text: string): string[] {
  const pieces = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '')
    .flatMap(cutLong)
  const chunks: string[] = []
  let current = ''
  for (const piece of pieces) {
    if (current && current.length + 2 + piece.length > MAX_CHUNK) {
      chunks.push(current)
      current = piece
      continue
    }
    current = current ? `${current}\n\n${piece}` : piece
  }
  if (current) chunks.push(current)
  return chunks
}
