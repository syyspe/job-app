// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { join } from 'node:path'
import { UNREACHABLE_URL } from '../../test/fakeOllama.ts'
import { closeProfileFixture, runNode, startProfileFixture, writeConfig } from '../../test/profileFixture.ts'
import type { ProfileFixture } from '../../test/profileFixture.ts'

const command = join(import.meta.dirname, 'build.ts')
let fixture: ProfileFixture

beforeEach(async () => {
  fixture = await startProfileFixture()
})

afterEach(async () => {
  await closeProfileFixture(fixture)
})

function run() {
  return runNode(command, [], fixture.env)
}

function expectOneLineError(result: { status: number | null; stdout: string; stderr: string }, status: number) {
  expect(result.status).toBe(status)
  expect(result.stderr.trimEnd().split('\n')).toHaveLength(1)
  expect(result.stderr).not.toContain('    at ')
  expect(result.stdout).toBe('')
}

test('the first build embeds everything and lists skipped files; a rerun changes nothing', async () => {
  const pdf = fixture.dir.write('corpus/facts/scan.pdf', 'pdf')

  const first = await run()
  const second = await run()

  expect(first.status).toBe(0)
  expect(first.stdout).toBe(
    `added 2, updated 0, removed 0, unchanged 0; 2 chunks embedded\nskipped, not .txt or .md:\n  ${pdf}\n`,
  )
  expect(second.stdout).toContain('added 0, updated 0, removed 0, unchanged 2; 0 chunks embedded')
})

test('a missing corpus path exits 2', async () => {
  const missing = join(fixture.dir.root, 'missing')
  writeConfig(fixture, { ...fixture.config, corpus: [{ path: missing, label: 'facts' }] })

  const result = await run()

  expectOneLineError(result, 2)
  expect(result.stderr).toContain('corpus[0].path')
})

test('a file reached from two entries exits 2', async () => {
  const cv = join(fixture.dir.root, 'corpus/facts/cv.md')
  writeConfig(fixture, { ...fixture.config, corpus: [...fixture.config.corpus, { path: cv, label: 'style' }] })

  expectOneLineError(await run(), 2)
})

test('a missing config file exits 2', async () => {
  fixture.dir.remove()

  expectOneLineError(await run(), 2)
})

test('an unreachable Ollama exits 1 before building', async () => {
  writeConfig(fixture, { ...fixture.config, ollamaUrl: UNREACHABLE_URL })

  const result = await run()

  expectOneLineError(result, 1)
  expect(result.stderr).toBe('Ollama health check failed: unreachable\n')
})

test('a model that is not pulled exits 1', async () => {
  fixture.fake.models = []

  const result = await run()

  expectOneLineError(result, 1)
  expect(result.stderr).toBe('Ollama health check failed: model_missing\n')
})

test.each([
  ['status', 'Ollama embedding failed: 500\n'],
  ['malformed', 'Ollama embedding failed: bad response\n'],
  ['wrongCount', 'Ollama embedding failed: bad response\n'],
] as const)('an embed %s failure exits 1 with one line', async (failure, message) => {
  fixture.fake.failure = failure

  const result = await run()

  expectOneLineError(result, 1)
  expect(result.stderr).toBe(message)
})
