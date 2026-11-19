// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { join } from 'node:path'
import { closeProfileFixture, runNode, startProfileFixture, writeConfig } from '../../test/profileFixture.ts'
import type { ProfileFixture } from '../../test/profileFixture.ts'

const command = join(import.meta.dirname, 'health.ts')
let fixture: ProfileFixture

beforeEach(async () => {
  fixture = await startProfileFixture()
})

afterEach(async () => {
  await closeProfileFixture(fixture)
})

test('a healthy endpoint prints ok and exits 0', async () => {
  const result = await runNode(command, [], fixture.env)

  expect(result).toEqual({ status: 0, stdout: 'ok\n', stderr: '' })
})

test('an unhealthy endpoint prints the reason and exits 1', async () => {
  fixture.fake.models = ['other:latest']

  const result = await runNode(command, [], fixture.env)

  expect(result).toEqual({ status: 1, stdout: '', stderr: 'model_missing\n' })
})

test('an invalid config exits 2 with one line', async () => {
  writeConfig(fixture, { ...fixture.config, embeddingModel: 42 })

  const result = await runNode(command, [], fixture.env)

  expect(result.status).toBe(2)
  expect(result.stderr).toMatch(/^[^\n]*config\.json: embeddingModel: [^\n]*\n$/)
  expect(result.stdout).toBe('')
})
