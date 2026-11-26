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

const command = join(import.meta.dirname, 'evaluate.ts')
const fakeClaude = join(import.meta.dirname, '..', '..', 'test', 'fakeClaude.ts')
let fixture: ProfileFixture
let jobApp: FakeJobApp
let env: Record<string, string>

beforeEach(async () => {
  fixture = await startProfileFixture()
  jobApp = await startFakeJobApp()
  const bin = join(fixture.dir.root, 'bin')
  mkdirSync(bin)
  symlinkSync(fakeClaude, join(bin, 'claude'))
  env = { ...fixture.env, PATH: `${bin}:${fixture.env.PATH}` }
  writeConfig(fixture, { ...fixture.config, titleRules: { reject: ['trainee'] } })
  fixture.dir.write('.config/job-agent/prompts/evaluate.md', 'Criteria: synthetic.')
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

test('screens, evaluates and reports; the fake answers {}, so the attempt is invalid_result', async () => {
  jobApp.ads.push(fakeAd({ id: 1, title: 'Trainee' }), fakeAd({ id: 2, state: 'ready', body: 'Ad text' }))

  const result = await run()

  expect(result.stderr).toBe('')
  expect(result.status).toBe(0)
  expect(result.stdout).toBe(
    'screened: 1 title_rejected, 0 awaiting_handover, 0 left new\n' +
      'evaluated: 0 suitable, 0 unsuitable, 1 retrying, 0 failed\n' +
      'queued: 0 ready ads over the per-run cap\n',
  )
  expect(jobApp.transitions).toEqual([
    { id: 1, to: 'title_rejected' },
    { id: 2, to: 'ready', error: 'invalid_result' },
  ])
})

test('Ollama down prints skipped, exits 0 and leaves ready ads alone', async () => {
  jobApp.ads.push(fakeAd({ id: 2, state: 'ready', body: 'Ad text' }))
  writeConfig(fixture, { ...fixture.config, ollamaUrl: UNREACHABLE_URL })

  const result = await run()

  expect(result.status).toBe(0)
  expect(result.stdout).toBe('screened: 0 title_rejected, 0 awaiting_handover, 0 left new\nevaluation skipped: unreachable\n')
  expect(jobApp.transitions).toEqual([])
})

test('a missing prompt file exits 2 naming it', async () => {
  const prompt = join(fixture.dir.root, '.config/job-agent/prompts/evaluate.md')
  rmSync(prompt)

  expectOneLineError(await run(), 2, `${prompt}: file not found`)
})

test('an invalid runner key exits 2 naming the field', async () => {
  writeConfig(fixture, { ...fixture.config, evaluation: { concurrency: 0 } })
  const path = join(fixture.dir.root, '.config/job-agent/config.json')

  const result = await run()

  expect(result.status).toBe(2)
  expect(result.stderr).toMatch(new RegExp(`^${path}: evaluation.concurrency: `))
})

test('an unverified CLI version exits 2 with the command to run', async () => {
  writeCheckRecord(join(fixture.dir.root, '.local/state/job-agent'), { cliVersion: '1.0.0', checkedAt: '' })

  expectOneLineError(await run(), 2, 'sandbox not verified for claude 9.9.9: run npm run agent:sandbox-check')
  expect(jobApp.logins).toBe(0)
})

test('an unreachable job-app exits 1', async () => {
  fixture.dir.write('.config/job-agent/env', `JOBAPP_API_URL=${UNREACHABLE_URL}\nJOBAPP_USERNAME=u\nJOBAPP_PASSWORD=p\n`)

  expectOneLineError(await run(), 1, `cannot reach job-app at ${UNREACHABLE_URL}`)
})

test('engine api with no API key exits 2 naming it', async () => {
  const price = { inputPerMTok: 1, outputPerMTok: 1, cacheWritePerMTok: 1, cacheReadPerMTok: 1 }
  const prices = { 'claude-haiku-5-5': price, 'claude-sonnet-5-5': price, 'claude-opus-5-5': price }
  writeConfig(fixture, { ...fixture.config, engine: 'api', api: { prices } })

  expectOneLineError(await run(), 2, `${join(fixture.dir.root, '.config/job-agent/env')}: ANTHROPIC_API_KEY is not set`)
  expect(jobApp.logins).toBe(0)
})
