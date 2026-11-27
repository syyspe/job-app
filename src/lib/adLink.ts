/** The ad a summary email links to, as `#ad-<id>`; null for any other hash. */
export function adIdFromHash(hash: string): number | null {
  const match = /^#ad-(\d+)$/.exec(hash)
  return match ? Number(match[1]) : null
}
