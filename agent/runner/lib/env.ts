import { parseEnv } from 'node:util'
import { CliError } from '../../lib/cliError.ts'
import { readConfigFile } from '../../profile/lib/config.ts'

export interface JobAppEnv {
  baseUrl: string
  username: string
  password: string
}

// Parsed, not loaded: the runner's credentials never enter process.env.
export function loadJobAppEnv(path: string): JobAppEnv {
  const values = parseEnv(readConfigFile(path))
  function required(name: string): string {
    const value = values[name]
    if (!value) throw new CliError(2, `${path}: ${name} is not set`)
    return value
  }
  return {
    baseUrl: required('JOBAPP_API_URL'),
    username: required('JOBAPP_USERNAME'),
    password: required('JOBAPP_PASSWORD'),
  }
}
