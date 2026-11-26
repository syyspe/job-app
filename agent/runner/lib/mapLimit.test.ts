// @vitest-environment node
import { expect, test } from 'vitest'
import { mapLimit } from './mapLimit.ts'

test('mapLimit keeps input order', async () => {
  const delays = [30, 10, 20]

  const results = await mapLimit(delays, { limit: 2 }, (ms) => new Promise<number>((resolve) => setTimeout(() => resolve(ms), ms)))

  expect(results).toEqual([30, 10, 20])
})

test('mapLimit starts no item once canStart turns false', async () => {
  const started: number[] = []

  const results = await mapLimit([1, 2, 3, 4], { limit: 1, canStart: () => started.length < 2 }, async (item) => {
    started.push(item)
    return item * 10
  })

  expect(results).toEqual([10, 20])
  expect(started).toEqual([1, 2])
})
