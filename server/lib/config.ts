export const DEFAULT_PAGE_SIZE = 7

export function parsePageSize(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_PAGE_SIZE
  const size = Number(raw)
  if (!Number.isInteger(size) || size < 1) {
    throw new Error(`PAGE_SIZE must be a whole number of at least 1 (got "${raw}")`)
  }
  return size
}
