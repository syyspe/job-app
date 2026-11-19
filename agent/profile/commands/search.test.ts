// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { join } from 'node:path'
import {
  buildFixtureIndex,
  closeProfileFixture,
  runNode,
  startProfileFixture,
  writeConfig,
} from '../../test/profileFixture.ts'
import type { ProfileFixture } from '../../test/profileFixture.ts'

const command = join(import.meta.dirname, 'search.ts')
let fixture: ProfileFixture

beforeEach(async () => {
  fixture = await startProfileFixture()
})

afterEach(async () => {
  await closeProfileFixture(fixture)
})

test('results print with score, label, source and text', async () => {
  await buildFixtureIndex(fixture)

  const result = await runNode(command, ['billing migration', 'facts'], fixture.env)

  expect(result.status).toBe(0)
  expect(result.stdout).toMatch(/^\d\.\d{3} {2}facts {2}cv\.md\n {2}Led the migration of a billing system to PostgreSQL\.\n\n$/)
})

test.each([[[]], [['query', 'other']], [['query', 'facts', 'extra']]])(
  'bad arguments %j exit 2 with the usage line',
  async (args) => {
    const result = await runNode(command, args, fixture.env)

    expect(result).toEqual({ status: 2, stdout: '', stderr: 'usage: npm run profile:search -- "<query>" [facts|style]\n' })
  },
)

test('a missing index exits 1 telling the user to build it', async () => {
  const result = await runNode(command, ['billing'], fixture.env)

  expect(result.status).toBe(1)
  expect(result.stderr).toMatch(/^no profile index at [^\n]*: run npm run profile:index\n$/)
})

test('an index built with another model exits 1', async () => {
  await buildFixtureIndex(fixture)
  writeConfig(fixture, { ...fixture.config, embeddingModel: 'other-embed' })

  const result = await runNode(command, ['billing'], fixture.env)

  expect(result.status).toBe(1)
  expect(result.stderr).toBe(
    'the profile index was built with a different embedding model: run npm run profile:index\n',
  )
})

test('a config error exits 2 with one line', async () => {
  writeConfig(fixture, { ...fixture.config, corpus: [{ path: 'relative', label: 'facts' }] })

  const result = await runNode(command, ['billing'], fixture.env)

  expect(result.status).toBe(2)
  expect(result.stderr).toMatch(/^[^\n]*config\.json: corpus\[0\]\.path: [^\n]*\n$/)
})
