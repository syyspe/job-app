import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcess } from 'node:child_process'

export interface FakeChild {
  child: ChildProcess
  stdout: PassThrough
  stderr: PassThrough
  // Ends both streams, then emits close once they have been read, as Node does.
  close: (code: number | null, signal?: NodeJS.Signals) => Promise<void>
}

export function fakeChild(): FakeChild {
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const child = Object.assign(new EventEmitter(), { stdout, stderr }) as unknown as ChildProcess
  const close = async (code: number | null, signal: NodeJS.Signals | null = null) => {
    stdout.end()
    stderr.end()
    await new Promise((resolve) => setImmediate(resolve))
    child.emit('close', code, signal)
  }
  return { child, stdout, stderr, close }
}
