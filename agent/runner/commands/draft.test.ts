// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { UNREACHABLE_URL } from '../../test/fakeOllama.ts'
import { startFakeJobApp } from '../../test/fakeJobApp.ts'
import type { FakeJobApp } from '../../test/fakeJobApp.ts'
import { fakeAd } from '../../test/fakeJobAppAds.ts'
import { closeProfileFixture, runNode, startProfileFixture, writeConfig } from '../../test/profileFixture.ts'
import type { ProfileFixture, RunResult } from '../../test/profileFixture.ts'
import { writeCheckRecord } from '../lib/sandboxCheck.ts'

const command = join(import.meta.dirname, 'draft.ts')
const fakeClaude = join(import.meta.dirname, '..', '..', 'test', 'fakeClaude.ts')
let fixture: ProfileFixture
let jobApp: FakeJobApp
let env: Record<string, string>
let drafting: Record<string, unknown>

beforeEach(async () => {
  fixture = await startProfileFixture()
  jobApp = await startFakeJobApp()
  const bin = join(fixture.dir.root, 'bin')
  mkdirSync(bin)
  symlinkSync(fakeClaude, join(bin, 'claude'))
  env = { ...fixture.env, PATH: `${bin}:${fixture.env.PATH}` }
  const fi = fixture.dir.write('templates/cv-fi.md', 'CV-pohja')
  const en = fixture.dir.write('templates/cv-en.md', 'CV template')
  drafting = { filePrefix: 'Tester', cvTemplates: { fi, en } }
  writeConfig(fixture, { ...fixture.config, drafting })
  fixture.dir.write('.config/job-agent/prompts/draft.md', 'Rules: synthetic.')
  fixture.dir.write(
    '.config/job-agent/env',
    `JOBAPP_API_URL=${jobApp.url}\nJOBAPP_USERNAME=${jobApp.username}\nJOBAPP_PASSWORD=${jobApp.password}\n`,
  )
  // fakeClaude.ts reports version 9.9.9.
  writeCheckRecord(join(fixture.dir.root, '.local/state/job-agent'), { cliVersion: '9.9.9', checkedAt: '' })
})

afterEach(async () => {
  await jobApp.close()
  await closeProfileFixture(fixture)
})

function run() {
  return runNode(command, [], env)
}

function expectOneLineError(result: RunResult, status: number, message: string) {
  expect(result.status).toBe(status)
  expect(result.stderr).toBe(`${message}\n`)
  expect(result.stdout).toBe('')
}

test('drafts and reports; the fake answers {}, so the attempt is invalid_result', async () => {
  jobApp.ads.push(fakeAd({ id: 1, state: 'suitable', body: 'Ad text' }))

  const result = await run()

  expect(result.stderr).toBe('')
  expect(result.status).toBe(0)
  expect(result.stdout).toBe('drafted: 0 drafted, 1 retrying, 0 failed\nqueued: 0 suitable ads over the per-run cap\n')
  expect(jobApp.transitions).toEqual([{ id: 1, to: 'suitable', error: 'invalid_result' }])
})

test('Ollama down prints skipped, exits 0 and leaves suitable ads alone', async () => {
  jobApp.ads.push(fakeAd({ id: 1, state: 'suitable', body: 'Ad text' }))
  writeConfig(fixture, { ...fixture.config, ollamaUrl: UNREACHABLE_URL, drafting })

  const result = await run()

  expect(result.status).toBe(0)
  expect(result.stdout).toBe('drafting skipped: unreachable\n')
  expect(jobApp.transitions).toEqual([])
})

test('a missing prompt file exits 2 naming it', async () => {
  const prompt = join(fixture.dir.root, '.config/job-agent/prompts/draft.md')
  rmSync(prompt)

  expectOneLineError(await run(), 2, `${prompt}: file not found`)
})

test('a missing CV template exits 2 naming it', async () => {
  const template = join(fixture.dir.root, 'templates/cv-en.md')
  rmSync(template)

  expectOneLineError(await run(), 2, `${template}: file not found`)
})

test('a missing drafting key exits 2 naming it', async () => {
  writeConfig(fixture, fixture.config)
  const path = join(fixture.dir.root, '.config/job-agent/config.json')

  const result = await run()

  expect(result.status).toBe(2)
  expect(result.stderr).toMatch(new RegExp(`^${path}: drafting: `))
})

test('an unverified CLI version exits 2 with the command to run', async () => {
  writeCheckRecord(join(fixture.dir.root, '.local/state/job-agent'), { cliVersion: '1.0.0', checkedAt: '' })

  expectOneLineError(await run(), 2, 'sandbox not verified for claude 9.9.9: run npm run agent:sandbox-check')
  expect(jobApp.logins).toBe(0)
})
