export interface Page<T> {
  items: T[]
  page: number
  pageCount: number
}

// pageSize is null until /api/config answers; an unknown size means one page
// holding everything, which is what the list showed before it was paged.
export function paginate<T>(items: T[], page: number, pageSize: number | null): Page<T> {
  if (pageSize === null) return { items, page: 1, pageCount: 1 }
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const current = Math.min(Math.max(page, 1), pageCount)
  const start = (current - 1) * pageSize
  return { items: items.slice(start, start + pageSize), page: current, pageCount }
}
