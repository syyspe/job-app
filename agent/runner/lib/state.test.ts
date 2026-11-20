// @vitest-environment node
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { makeTempDir } from '../../test/tempDir.ts'
import type { TempDir } from '../../test/tempDir.ts'
import { createRunnerState, localDate } from './state.ts'

let dir: TempDir

beforeEach(() => {
  dir = makeTempDir()
})

afterEach(() => {
  dir.remove()
})

test('a fresh state directory starts at UID 0 with no failures', () => {
  const state = createRunnerState(`${dir.root}/state`)

  expect(state.readWatermark()).toEqual({ uidValidity: 0, lastUid: 0 })
  expect(state.readFailures()).toEqual([])
})

test('the watermark round-trips through its file', () => {
  const state = createRunnerState(`${dir.root}/state`)

  state.writeWatermark({ uidValidity: 7, lastUid: 42 })

  expect(createRunnerState(`${dir.root}/state`).readWatermark()).toEqual({ uidValidity: 7, lastUid: 42 })
  expect(JSON.parse(readFileSync(`${dir.root}/state/mail-watermark.json`, 'utf8'))).toEqual({ uidValidity: 7, lastUid: 42 })
})

test('failures append', () => {
  const state = createRunnerState(dir.root)

  state.addFailure({ source: 'a', date: '2026-11-20', kind: 'blocked' })
  state.addFailure({ source: 'b', date: '2026-11-20', kind: 'empty_alert' })

  expect(state.readFailures().map((failure) => failure.source)).toEqual(['a', 'b'])
})

test('counters persist per source and reset on a new date', () => {
  const state = createRunnerState(dir.root)
  const today = state.counters('2026-11-20')

  today.countOpen('a')
  today.countOpen('a')
  today.markBlocked('b')

  expect(state.counters('2026-11-20').opened('a')).toBe(2)
  expect(state.counters('2026-11-20').isBlocked('b')).toBe(true)
  expect(state.counters('2026-11-21').opened('a')).toBe(0)
  expect(state.counters('2026-11-21').isBlocked('b')).toBe(false)
})

test.each([
  ['the wrong shape', '{"lastUid": "x"}'],
  ['invalid JSON', '{ nope'],
])('a state file with %s is an exit-2 error naming it', (_name, text) => {
  const path = dir.write('mail-watermark.json', text)

  expect(() => createRunnerState(dir.root).readWatermark()).toThrow(
    expect.objectContaining({ exitCode: 2, message: `${path}: not a valid state file; fix or delete it` }),
  )
})

test('localDate is the local calendar date', () => {
  expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
})

test('removing reported failures keeps the ones the summary did not cover', () => {
  const state = createRunnerState(dir.root)
  const reported = { source: 'a', date: '2026-11-20', kind: 'blocked' as const }
  state.addFailure(reported)
  state.addFailure({ source: 'a', date: '2026-11-21', kind: 'blocked' })

  state.removeFailures([reported])

  expect(state.readFailures()).toEqual([{ source: 'a', date: '2026-11-21', kind: 'blocked' }])
})
