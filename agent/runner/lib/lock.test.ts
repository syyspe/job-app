// @vitest-environment node
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { startFakeRunHolder } from '../../test/fakeRunHolder.ts'
import { makeTempDir } from '../../test/tempDir.ts'
import type { TempDir } from '../../test/tempDir.ts'
import { acquireRunLock } from './lock.ts'

let dir: TempDir

beforeEach(() => {
  dir = makeTempDir()
})

afterEach(() => {
  dir.remove()
})

// A pid that has exited, so it is certainly not running.
function deadPid(): number {
  return spawnSync('true').pid as number
}

test('taking the lock writes this pid, and releasing it removes the file', () => {
  const release = acquireRunLock(`${dir.root}/state`)
  const path = join(dir.root, 'state', 'run.lock')

  expect(readFileSync(path, 'utf8')).toBe(String(process.pid))
  release()
  expect(existsSync(path)).toBe(false)
})

test('a lock held by a live run is refused naming its pid', () => {
  const holder = startFakeRunHolder()
  try {
    writeFileSync(join(dir.root, 'run.lock'), String(holder.pid))

    expect(() => acquireRunLock(dir.root)).toThrow(
      expect.objectContaining({ exitCode: 1, message: `another run is in progress (pid ${holder.pid})` }),
    )
  } finally {
    holder.stop()
  }
})

test('a lock whose pid now belongs to another process is taken over', () => {
  writeFileSync(join(dir.root, 'run.lock'), String(process.pid))
  const release = acquireRunLock(dir.root)

  expect(readFileSync(join(dir.root, 'run.lock'), 'utf8')).toBe(String(process.pid))
  release()
})

test('a lock left by a dead process is taken over', () => {
  writeFileSync(join(dir.root, 'run.lock'), String(deadPid()))

  acquireRunLock(dir.root)

  expect(readFileSync(join(dir.root, 'run.lock'), 'utf8')).toBe(String(process.pid))
})

test('an unreadable lock file is stale and taken over', () => {
  writeFileSync(join(dir.root, 'run.lock'), 'not a pid')

  acquireRunLock(dir.root)

  expect(readFileSync(join(dir.root, 'run.lock'), 'utf8')).toBe(String(process.pid))
})
