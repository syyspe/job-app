// @vitest-environment node
import { expect, test } from 'vitest'
import { configPath, envPath, indexPath, promptsDir, stateDir } from './paths.ts'

test('the XDG variables win over HOME', () => {
  const env = { HOME: '/home/u', XDG_CONFIG_HOME: '/cfg', XDG_DATA_HOME: '/data', XDG_STATE_HOME: '/state' }

  expect(configPath(env)).toBe('/cfg/job-agent/config.json')
  expect(indexPath(env)).toBe('/data/job-agent/profile.db')
  expect(envPath(env)).toBe('/cfg/job-agent/env')
  expect(promptsDir(env)).toBe('/cfg/job-agent/prompts')
  expect(stateDir(env)).toBe('/state/job-agent')
})

test('without XDG variables the paths fall back to HOME', () => {
  const env = { HOME: '/home/u' }

  expect(configPath(env)).toBe('/home/u/.config/job-agent/config.json')
  expect(indexPath(env)).toBe('/home/u/.local/share/job-agent/profile.db')
  expect(envPath(env)).toBe('/home/u/.config/job-agent/env')
  expect(promptsDir(env)).toBe('/home/u/.config/job-agent/prompts')
  expect(stateDir(env)).toBe('/home/u/.local/state/job-agent')
})

test('an unset HOME is a config error', () => {
  expect(() => configPath({})).toThrow('HOME is not set')
})
