import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AlertMessage, PageResult, PoliteHttp } from '../runner/lib/sources/types.ts'

const FIXTURES = join(import.meta.dirname, '..', 'runner', 'lib', 'sources', 'fixtures')

export function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8')
}

export function alert(fields: Partial<AlertMessage> = {}): AlertMessage {
  return { uid: 1, from: 'alerts@example.com', subject: 'Alert', date: '2026-11-20T08:00:00.000Z', html: '', text: '', ...fields }
}

export interface FakePoliteHttp extends PoliteHttp {
  urls: string[]
}

// Answers every get with `result` and records the URLs asked for.
export function fakePoliteHttp(result: PageResult): FakePoliteHttp {
  const urls: string[] = []
  return {
    urls,
    dayEnded: false,
    get: (url) => {
      urls.push(url)
      return Promise.resolve(result)
    },
  }
}
