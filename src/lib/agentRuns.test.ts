import { expect, test } from 'vitest'
import { runSpend } from './agentRuns.ts'

test('runSpend reads the figures from the api line', () => {
  expect(runSpend('summary: sent\napi: $0.42 run, $4.12 month\n')).toEqual({ run: '0.42', month: '4.12' })
})

test('runSpend takes the last api line, even with failure lines after it', () => {
  const output = 'api: $9.99 run, $9.99 month\napi: $0.42 run, $4.12 month\ncollect failed: cannot reach mailbox\n'

  expect(runSpend(output)).toEqual({ run: '0.42', month: '4.12' })
})

test('runSpend is null without an api line', () => {
  expect(runSpend('collected 2 ads\nsummary: nothing to report\n')).toBeNull()
})
