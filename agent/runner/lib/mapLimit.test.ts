// @vitest-environment node
import { expect, test } from 'vitest'
import { mapLimit } from './mapLimit.ts'

test('mapLimit keeps input order', async () => {
  const delays = [30, 10, 20]

  const results = await mapLimit(delays, 2, (ms) => new Promise<number>((resolve) => setTimeout(() => resolve(ms), ms)))

  expect(results).toEqual([30, 10, 20])
})
