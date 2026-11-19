// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { makeTempDir } from '../../test/tempDir.ts'
import type { TempDir } from '../../test/tempDir.ts'
import { loadJobAppEnv } from './env.ts'

let dir: TempDir

beforeEach(() => {
  dir = makeTempDir()
})

afterEach(() => {
  dir.remove()
})

const complete = 'JOBAPP_API_URL=http://localhost:3001\nJOBAPP_USERNAME=runner\nJOBAPP_PASSWORD="se cret"\n'

test('reads the three job-app variables without touching process.env', () => {
  const path = dir.write('env', `# runner\n${complete}`)

  expect(loadJobAppEnv(path)).toEqual({
    baseUrl: 'http://localhost:3001',
    username: 'runner',
    password: 'se cret',
  })
  expect(process.env.JOBAPP_USERNAME).toBeUndefined()
})

test('a missing file is an exit-2 error naming it', () => {
  const path = `${dir.root}/env`

  expect(() => loadJobAppEnv(path)).toThrow(
    expect.objectContaining({ exitCode: 2, message: `${path}: file not found` }),
  )
})

test('a missing variable is an exit-2 error naming it', () => {
  const path = dir.write('env', complete.replace(/JOBAPP_PASSWORD=.*\n/, ''))

  expect(() => loadJobAppEnv(path)).toThrow(
    expect.objectContaining({ exitCode: 2, message: `${path}: JOBAPP_PASSWORD is not set` }),
  )
})
