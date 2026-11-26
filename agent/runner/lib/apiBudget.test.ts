// @vitest-environment node
import { expect, test } from 'vitest'
import { memoryLedger } from '../../test/memoryLedger.ts'
import { createRunBudget, responseCost, UNLIMITED } from './apiBudget.ts'

const price = { inputPerMTok: 3, outputPerMTok: 15, cacheWritePerMTok: 3.75, cacheReadPerMTok: 0.3 }

function budgetWith(ledger = memoryLedger(), monthlyUsd = 30) {
  return createRunBudget({ perRunUsd: 3, monthlyUsd, prices: { m: price }, ledger })
}

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
  const budget = budgetWith()

  budget.charge('m', usage(999_999))
  expect(budget.canStart()).toBe(true)
  expect(budget.stopReason()).toBeNull()

  budget.charge('m', usage(1))
  expect(budget.canStart()).toBe(false)
  expect(budget.stopReason()).toBe('API run cap reached at $3.00')
})

test('an explicit stop wins over the cap and keeps its first reason', () => {
  const budget = budgetWith()

  budget.stop('Claude API: authentication failed')
  budget.stop('Claude API: permission denied')
  budget.charge('m', usage(2_000_000))

  expect(budget.canStart()).toBe(false)
  expect(budget.stopReason()).toBe('Claude API: authentication failed')
})

test('the unlimited budget always starts', () => {
  expect(UNLIMITED.canStart()).toBe(true)
  expect(UNLIMITED.stopReason()).toBeNull()
  expect(UNLIMITED.spend()).toBeNull()
})

test('a charge counts toward both the run and the month', () => {
  const ledger = memoryLedger(4)
  const budget = budgetWith(ledger)

  budget.charge('m', usage(100_000))

  expect(ledger.total()).toBeCloseTo(4.3)
  expect(budget.spend()).toEqual({ runUsd: expect.closeTo(0.3), monthUsd: expect.closeTo(4.3), monthlyUsd: 30 })
})

test('the budget stops new steps once the month reaches its cap', () => {
  const budget = budgetWith(memoryLedger(29), 30)

  budget.charge('m', usage(333_333))
  expect(budget.canStart()).toBe(true)

  budget.charge('m', usage(1))
  expect(budget.canStart()).toBe(false)
  expect(budget.stopReason()).toBe('API monthly cap reached: $30.00 of $30.00')
})

test('a month already at its cap stops the run before the first step', () => {
  const budget = budgetWith(memoryLedger(31.5), 30)

  expect(budget.canStart()).toBe(false)
  expect(budget.stopReason()).toBe('API monthly cap reached: $31.50 of $30.00')
  expect(budget.spend()).toBeNull()
})

test('the run cap wins when both caps are reached', () => {
  const budget = budgetWith(memoryLedger(29), 30)

  budget.charge('m', usage(1_000_000))

  expect(budget.stopReason()).toBe('API run cap reached at $3.00')
})

test('spend is null until the run makes a call', () => {
  const budget = budgetWith(memoryLedger(5))

  expect(budget.spend()).toBeNull()
  budget.charge('m', usage(0))
  expect(budget.spend()).toEqual({ runUsd: 0, monthUsd: 5, monthlyUsd: 30 })
})
