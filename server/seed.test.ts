// @vitest-environment node
import { expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

test('missing seed variables exit 2 with one line and no stack', () => {
  const result = spawnSync(process.execPath, [join(import.meta.dirname, 'seed.ts')], {
    env: { PATH: process.env.PATH ?? '' },
    encoding: 'utf8',
  })

  expect(result.status).toBe(2)
  expect(result.stderr).toContain('DB_PATH, SEED_USERNAME and SEED_PASSWORD must all be set')
  expect(result.stderr).not.toContain('    at ')
})
