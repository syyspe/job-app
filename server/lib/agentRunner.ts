import type { ChildProcess, SpawnOptions } from 'node:child_process'
import { join } from 'node:path'
import type { AgentRunKind } from '../types.ts'

// The only commands the API spawns, relative to the runner root. No request
// value ever reaches argv.
export const RUNNER_ARGS: Record<AgentRunKind, readonly string[]> = {
  run: ['agent/runner/commands/run.ts'],
  collect: ['agent/runner/commands/collect.ts'],
}

export const REPO_ROOT = join(import.meta.dirname, '../..')

// The runner reads its own config under HOME/XDG; the server's secrets stay behind.
const ENV_ALLOWLIST = [
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'TZ',
  'XDG_CONFIG_HOME',
  'XDG_STATE_HOME',
  'XDG_DATA_HOME',
  'XDG_CACHE_HOME',
  'NODE_EXTRA_CA_CERTS',
] as const

type Env = Record<string, string | undefined>

export type SpawnFn = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess

export type RunnerSpawner = (kind: AgentRunKind) => ChildProcess

export function runnerEnv(env: Env): Record<string, string> {
  const allowed: Record<string, string> = {}
  for (const name of ENV_ALLOWLIST) {
    const value = env[name]
    if (value !== undefined) allowed[name] = value
  }
  return allowed
}

export function createRunnerSpawner(spawn: SpawnFn, root: string, env: Env): RunnerSpawner {
  return (kind) =>
    spawn(process.execPath, [...RUNNER_ARGS[kind]], {
      cwd: root,
      env: runnerEnv(env),
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
}
