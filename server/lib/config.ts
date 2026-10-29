import { readFileSync } from 'node:fs'
import { LOG_LEVELS } from './logger.ts'
import type { LogLevel } from './logger.ts'

export const DEFAULT_PAGE_SIZE = 7

export function parsePageSize(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_PAGE_SIZE
  const size = Number(raw)
  if (!Number.isInteger(size) || size < 1) {
    throw new Error(`PAGE_SIZE must be a whole number of at least 1 (got "${raw}")`)
  }
  return size
}

export function parseLogLevel(raw: string | undefined): LogLevel {
  if (raw === undefined) return 'info'
  const level = LOG_LEVELS.find((name) => name === raw)
  if (level === undefined) {
    throw new Error(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}`)
  }
  return level
}

export type TlsFiles = { cert: Buffer; key: Buffer }

// An empty value counts as unset, so `TLS_CERT= TLS_KEY=` can switch TLS off
// over a `.env` that sets them.
export function parseTls(certPath: string | undefined, keyPath: string | undefined): TlsFiles | undefined {
  if (!certPath && !keyPath) return undefined
  if (!certPath || !keyPath) {
    throw new Error('TLS_CERT and TLS_KEY must be set together, or both left unset')
  }
  return { cert: readTlsFile('TLS_CERT', certPath), key: readTlsFile('TLS_KEY', keyPath) }
}

function readTlsFile(name: string, path: string): Buffer {
  try {
    return readFileSync(path)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    throw new Error(`${name} could not be read: ${path} (${code})`, { cause: error })
  }
}
