// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { makeTempDir } from '../../test/tempDir.ts'
import type { TempDir } from '../../test/tempDir.ts'
import { createSpendLedger } from './apiSpend.ts'

let dir: TempDir
let path: string

beforeEach(() => {
  dir = makeTempDir()
  path = join(dir.root, 'api-spend.json')
})

afterEach(() => {
  dir.remove()
})

function stored(): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

test('a missing file is no spend yet', () => {
  expect(createSpendLedger(path, () => new Date(2026, 10, 26)).monthTotal()).toBe(0)
})

test('add accumulates in the current local month', () => {
  const ledger = createSpendLedger(path, () => new Date(2026, 10, 26))

  ledger.add(0.25)
  ledger.add(0.5)

  expect(ledger.monthTotal()).toBeCloseTo(0.75)
  expect(stored()).toEqual({ months: { '2026-11': 0.75 } })
})

test('a new month starts its own total and keeps the previous one', () => {
  let now = new Date(2026, 11, 31, 23, 59)
  const ledger = createSpendLedger(path, () => now)
  ledger.add(2)

  now = new Date(2027, 0, 1, 0, 1)
  expect(ledger.monthTotal()).toBe(0)
  ledger.add(1)

  expect(stored()).toEqual({ months: { '2027-01': 1, '2026-12': 2 } })
})

test('a month older than the previous one is dropped on write', () => {
  dir.write('api-spend.json', JSON.stringify({ months: { '2026-09': 5, '2026-10': 4, '2026-11': 3 } }))
  const ledger = createSpendLedger(path, () => new Date(2026, 10, 26))

  ledger.add(1)

  expect(stored()).toEqual({ months: { '2026-11': 4, '2026-10': 4 } })
})

test('a write leaves no temp file behind', () => {
  createSpendLedger(path, () => new Date(2026, 10, 26)).add(1)

  expect(existsSync(`${path}.tmp`)).toBe(false)
})

test('a temp file left by a crash does not affect the read', () => {
  dir.write('api-spend.json', JSON.stringify({ months: { '2026-11': 2 } }))
  dir.write('api-spend.json.tmp', '{"months":')

  expect(createSpendLedger(path, () => new Date(2026, 10, 26)).monthTotal()).toBe(2)
})

test.each([
  ['invalid JSON', '{"months":'],
  ['the wrong shape', JSON.stringify({ months: { '2026-11': 'lots' } })],
])('%s is an exit-2 error', (_case, text) => {
  dir.write('api-spend.json', text)

  expect(() => createSpendLedger(path, () => new Date(2026, 10, 26)).monthTotal()).toThrow(
    expect.objectContaining({ exitCode: 2, message: `${path}: not a valid state file; fix or delete it` }),
  )
})
