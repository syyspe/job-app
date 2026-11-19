import { join } from 'node:path'
import { CliError } from './cliError.ts'

export type Env = Record<string, string | undefined>

function home(env: Env): string {
  if (!env.HOME) throw new CliError(2, 'HOME is not set')
  return env.HOME
}

export function configPath(env: Env): string {
  const base = env.XDG_CONFIG_HOME || join(home(env), '.config')
  return join(base, 'job-agent', 'config.json')
}

export function envPath(env: Env): string {
  const base = env.XDG_CONFIG_HOME || join(home(env), '.config')
  return join(base, 'job-agent', 'env')
}

export function promptsDir(env: Env): string {
  const base = env.XDG_CONFIG_HOME || join(home(env), '.config')
  return join(base, 'job-agent', 'prompts')
}

export function stateDir(env: Env): string {
  const base = env.XDG_STATE_HOME || join(home(env), '.local', 'state')
  return join(base, 'job-agent')
}

export function indexPath(env: Env): string {
  const base = env.XDG_DATA_HOME || join(home(env), '.local', 'share')
  return join(base, 'job-agent', 'profile.db')
}
