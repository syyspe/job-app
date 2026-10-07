// @vitest-environment node
import { expect, test } from 'vitest'
import { createLogger } from './logger.ts'
import type { LogLevel } from './logger.ts'

function capture(level: LogLevel) {
  const lines: string[] = []
  const logger = createLogger(level, (line) => {
    lines.push(line)
  })
  return { logger, lines }
}

test('a call writes one JSON line with time, level, message and fields', () => {
  const { logger, lines } = capture('info')

  logger.info('order created', { orderId: 7 })

  expect(lines).toHaveLength(1)
  expect(lines[0].endsWith('\n')).toBe(true)
  const entry = JSON.parse(lines[0])
  expect(entry).toEqual({ time: expect.any(String), level: 'info', msg: 'order created', orderId: 7 })
  expect(new Date(entry.time).toISOString()).toBe(entry.time)
})

test('lines below the level are not written', () => {
  const { logger, lines } = capture('warn')

  logger.debug('detail')
  logger.info('story')
  logger.warn('odd')
  logger.error('broken')

  expect(lines.map((line) => JSON.parse(line).level)).toEqual(['warn', 'error'])
})

test('silent writes nothing', () => {
  const { logger, lines } = capture('silent')

  logger.error('broken')

  expect(lines).toEqual([])
})

test("a child's fields appear on every line, and a call's own fields win", () => {
  const { logger, lines } = capture('debug')
  const child = logger.child({ requestId: 'abc', source: 'child' })

  child.debug('first')
  child.info('second', { source: 'call' })

  expect(JSON.parse(lines[0])).toMatchObject({ requestId: 'abc', source: 'child' })
  expect(JSON.parse(lines[1])).toMatchObject({ requestId: 'abc', source: 'call' })
})
