// @vitest-environment node
import { expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const fixture = join(import.meta.dirname, '..', 'test', 'runCommandFixture.ts')

function run(kind: string) {
  return spawnSync(process.execPath, [fixture, kind], { encoding: 'utf8' })
}

test('a CliError prints as one stderr line and exits with its code', () => {
  const result = run('cli')

  expect(result.status).toBe(2)
  expect(result.stderr).toBe('config.json: corpus is required\n')
  expect(result.stdout).toBe('')
})

test('any other error propagates with its stack', () => {
  const result = run('other')

  expect(result.status).toBe(1)
  expect(result.stderr).toContain('unexpected failure')
  expect(result.stderr).toContain('    at ')
})
