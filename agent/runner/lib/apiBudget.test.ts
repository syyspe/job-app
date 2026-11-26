// @vitest-environment node
import { expect, test } from 'vitest'
import { createRunBudget, responseCost, UNLIMITED } from './apiBudget.ts'

const price = { inputPerMTok: 3, outputPerMTok: 15, cacheWritePerMTok: 3.75, cacheReadPerMTok: 0.3 }

function usage(input: number, output = 0) {
  return { input_tokens: input, output_tokens: output, cache_creation_input_tokens: null, cache_read_input_tokens: null }
}

test('a response costs each token kind at its own price', () => {
  const cost = responseCost(price, {
    input_tokens: 1_000_000,
    output_tokens: 100_000,
    cache_creation_input_tokens: 200_000,
    cache_read_input_tokens: 1_000_000,
  })

  expect(cost).toBeCloseTo(3 + 1.5 + 0.75 + 0.3)
})

test('null cache counts cost nothing', () => {
  expect(responseCost(price, usage(1_000_000))).toBeCloseTo(3)
})

test('the budget stops new steps exactly at the cap', () => {
  const budget = createRunBudget({ perRunUsd: 3, prices: { m: price } })

  budget.charge('m', usage(999_999))
  expect(budget.canStart()).toBe(true)
  expect(budget.stopReason()).toBeNull()

  budget.charge('m', usage(1))
  expect(budget.canStart()).toBe(false)
  expect(budget.stopReason()).toBe('API run cap reached at $3.00')
})

test('an explicit stop wins over the cap and keeps its first reason', () => {
  const budget = createRunBudget({ perRunUsd: 3, prices: { m: price } })

  budget.stop('Claude API: authentication failed')
  budget.stop('Claude API: permission denied')
  budget.charge('m', usage(2_000_000))

  expect(budget.canStart()).toBe(false)
  expect(budget.stopReason()).toBe('Claude API: authentication failed')
})

test('the unlimited budget always starts', () => {
  expect(UNLIMITED.canStart()).toBe(true)
  expect(UNLIMITED.stopReason()).toBeNull()
})
