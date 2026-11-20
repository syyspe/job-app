import { parseEnv } from 'node:util'
import { CliError } from '../../lib/cliError.ts'
import { readConfigFile } from '../../profile/lib/config.ts'

export interface JobAppEnv {
  baseUrl: string
  username: string
  password: string
}

export interface MailEnv {
  host: string
  username: string
  password: string
}

// Parsed, not loaded: the runner's credentials never enter process.env.
function readEnvFile(path: string): (name: string) => string {
  const values = parseEnv(readConfigFile(path))
  return (name) => {
    const value = values[name]
    if (!value) throw new CliError(2, `${path}: ${name} is not set`)
    return value
  }
}

export function loadJobAppEnv(path: string): JobAppEnv {
  const required = readEnvFile(path)
  return {
    baseUrl: required('JOBAPP_API_URL'),
    username: required('JOBAPP_USERNAME'),
    password: required('JOBAPP_PASSWORD'),
  }
}

export function loadMailEnv(path: string): MailEnv {
  const required = readEnvFile(path)
  return { host: required('MAIL_IMAP_HOST'), username: required('MAIL_USERNAME'), password: required('MAIL_PASSWORD') }
}
