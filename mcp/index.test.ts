// @vitest-environment node
import { expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

test('missing JOBAPP_* variables exit 2 with one line and no stack', () => {
  const result = spawnSync(process.execPath, [join(import.meta.dirname, 'index.ts')], {
    env: { PATH: process.env.PATH ?? '' },
    encoding: 'utf8',
  })

  expect(result.status).toBe(2)
  expect(result.stderr).toContain('JOBAPP_API_URL, JOBAPP_USERNAME and JOBAPP_PASSWORD must all be set')
  expect(result.stderr).not.toContain('    at ')
  expect(result.stdout).toBe('')
})
