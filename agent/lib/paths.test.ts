// @vitest-environment node
import { expect, test } from 'vitest'
import { configPath, indexPath } from './paths.ts'

test('the XDG variables win over HOME', () => {
  const env = { HOME: '/home/u', XDG_CONFIG_HOME: '/cfg', XDG_DATA_HOME: '/data' }

  expect(configPath(env)).toBe('/cfg/job-agent/config.json')
  expect(indexPath(env)).toBe('/data/job-agent/profile.db')
})

test('without XDG variables the paths fall back to HOME', () => {
  const env = { HOME: '/home/u' }

  expect(configPath(env)).toBe('/home/u/.config/job-agent/config.json')
  expect(indexPath(env)).toBe('/home/u/.local/share/job-agent/profile.db')
})

test('an unset HOME is a config error', () => {
  expect(() => configPath({})).toThrow('HOME is not set')
})
