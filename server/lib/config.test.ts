// @vitest-environment node
import { expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_PAGE_SIZE, parseLogLevel, parsePageSize, parseTls } from './config.ts'

test('an unset PAGE_SIZE means the default', () => {
  expect(parsePageSize(undefined)).toBe(DEFAULT_PAGE_SIZE)
  expect(DEFAULT_PAGE_SIZE).toBe(7)
})

test('a whole number is the page size', () => {
  expect(parsePageSize('12')).toBe(12)
})

test.each(['0', '-3', 'abc', '2.5', ''])('%o is rejected', (raw) => {
  expect(() => parsePageSize(raw)).toThrow(/PAGE_SIZE/)
})

test('an unset LOG_LEVEL means info', () => {
  expect(parseLogLevel(undefined)).toBe('info')
})

test('a level name is the log level', () => {
  expect(parseLogLevel('debug')).toBe('debug')
})

test('an unknown level is rejected', () => {
  expect(() => parseLogLevel('loud')).toThrow('LOG_LEVEL must be one of debug, info, warn, error, silent')
})

test.each([
  [undefined, undefined],
  ['', ''],
])('TLS_CERT %o and TLS_KEY %o mean no TLS', (cert, key) => {
  expect(parseTls(cert, key)).toBeUndefined()
})

test.each([
  ['/some/cert.pem', undefined],
  [undefined, '/some/key.pem'],
  ['/some/cert.pem', ''],
])('TLS_CERT %o without TLS_KEY %o, or the reverse, is rejected', (cert, key) => {
  expect(() => parseTls(cert, key)).toThrow(
    'TLS_CERT and TLS_KEY must be set together, or both left unset',
  )
})

test('an unreadable file names its variable, its path and the errno code', () => {
  const root = mkdtempSync(join(tmpdir(), 'job-app-tls-'))
  const cert = join(root, 'cert.pem')
  const key = join(root, 'key.pem')
  writeFileSync(cert, 'CERT')
  writeFileSync(key, 'KEY')
  const missing = join(root, 'missing.pem')
  try {
    expect(() => parseTls(missing, key)).toThrow(`TLS_CERT could not be read: ${missing} (ENOENT)`)
    expect(() => parseTls(cert, missing)).toThrow(`TLS_KEY could not be read: ${missing} (ENOENT)`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('two readable files come back as the cert and key', () => {
  const root = mkdtempSync(join(tmpdir(), 'job-app-tls-'))
  const cert = join(root, 'cert.pem')
  const key = join(root, 'key.pem')
  writeFileSync(cert, 'CERT')
  writeFileSync(key, 'KEY')
  try {
    const tls = parseTls(cert, key)
    expect(tls?.cert.toString()).toBe('CERT')
    expect(tls?.key.toString()).toBe('KEY')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
