export interface MapLimits {
  // At most this many calls in flight.
  limit: number
  // Asked before each item; once false, no further item starts.
  canStart?: () => boolean
}

// Runs fn over items, keeping input order. The result holds only the items
// that started.
export async function mapLimit<T, R>(items: T[], limits: MapLimits, fn: (item: T) => Promise<R>): Promise<R[]> {
  const canStart = limits.canStart ?? (() => true)
  const results = new Array<R>(items.length)
  let next = 0
  async function worker(): Promise<void> {
    while (next < items.length && canStart()) {
      const index = next++
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limits.limit, items.length) }, worker))
  return results.slice(0, next)
}
