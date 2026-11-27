// @vitest-environment node
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { expect, test } from 'vitest'
import { createRunnerSpawner, runnerEnv } from './agentRunner.ts'
import type { SpawnFn } from './agentRunner.ts'

interface SpawnCall {
  command: string
  args: readonly string[]
  options: Parameters<SpawnFn>[2]
}

function recordingSpawn(): { spawn: SpawnFn; calls: SpawnCall[] } {
  const calls: SpawnCall[] = []
  const spawn: SpawnFn = (command, args, options) => {
    calls.push({ command, args, options })
    return new EventEmitter() as ChildProcess
  }
  return { spawn, calls }
}

test.each(['run', 'collect'] as const)('a %s spawns node on its fixed script', (kind) => {
  const { spawn, calls } = recordingSpawn()

  createRunnerSpawner(spawn, '/repo', {})({ kind })

  expect(calls).toHaveLength(1)
  expect(calls[0].command).toBe(process.execPath)
  expect(calls[0].args).toEqual([`agent/runner/commands/${kind}.ts`])
})

test('the child runs in the given root, without a shell, stdout and stderr piped', () => {
  const { spawn, calls } = recordingSpawn()

  createRunnerSpawner(spawn, '/repo', {})({ kind: 'run' })

  expect(calls[0].options).toMatchObject({ cwd: '/repo', shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
})

test('a draft spawns its fixed script with the ad id as the one argument, without a shell', () => {
  const { spawn, calls } = recordingSpawn()

  createRunnerSpawner(spawn, '/repo', {})({ kind: 'draft', adId: 42 })

  expect(calls[0].args).toEqual(['agent/runner/commands/draft.ts', '42'])
  expect(calls[0].options.shell).toBe(false)
})

test('the child env carries only the allowlisted variables that are set', () => {
  const env = {
    PATH: '/bin',
    HOME: '/home/u',
    NODE_EXTRA_CA_CERTS: '/ca.pem',
    DB_PATH: '/data/app.db',
    SESSION_SECRET: 'secret',
    ANTHROPIC_API_KEY: 'key',
    UPLOADS_DIR: '/uploads',
  }

  expect(runnerEnv(env)).toEqual({ PATH: '/bin', HOME: '/home/u', NODE_EXTRA_CA_CERTS: '/ca.pem' })
})

test('the spawner passes the allowlisted env to the child', () => {
  const { spawn, calls } = recordingSpawn()

  createRunnerSpawner(spawn, '/repo', { PATH: '/bin', DB_PATH: '/data/app.db' })({ kind: 'collect' })

  expect(calls[0].options.env).toEqual({ PATH: '/bin' })
})
