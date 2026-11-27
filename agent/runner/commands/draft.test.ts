// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { chmodSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { UNREACHABLE_URL } from '../../test/fakeOllama.ts'
import { startFakeJobApp } from '../../test/fakeJobApp.ts'
import type { FakeJobApp } from '../../test/fakeJobApp.ts'
import { fakeAd } from '../../test/fakeJobAppAds.ts'
import { startFakeRunHolder } from '../../test/fakeRunHolder.ts'
import { closeProfileFixture, runNode, startProfileFixture, writeConfig } from '../../test/profileFixture.ts'
import type { ProfileFixture, RunResult } from '../../test/profileFixture.ts'
import { readCheckRecord, writeCheckRecord } from '../lib/sandboxCheck.ts'

const command = join(import.meta.dirname, 'draft.ts')
const fakeClaude = join(import.meta.dirname, '..', '..', 'test', 'fakeClaude.ts')
let fixture: ProfileFixture
let jobApp: FakeJobApp
let env: Record<string, string>
let drafting: Record<string, unknown>
let bin: string
let stateDir: string

beforeEach(async () => {
  fixture = await startProfileFixture()
  jobApp = await startFakeJobApp()
  bin = join(fixture.dir.root, 'bin')
  stateDir = join(fixture.dir.root, '.local/state/job-agent')
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
  writeCheckRecord(stateDir, { cliVersion: '9.9.9', checkedAt: '' })
})

afterEach(async () => {
  await jobApp.close()
  await closeProfileFixture(fixture)
})

function run(args = ['1']) {
  return runNode(command, args, env)
}

const VALID_DRAFT = {
  language: 'en',
  applicationType: 'portal',
  company: '',
  role: '',
  applyTo: '',
  fitSummary: 'Fits.',
  coverLetter: 'Because [[ASK:q1]].',
  cv: 'CV',
  questions: [{ id: 'q1', text: 'Why?' }],
}

// fakeClaude.ts answers {} and takes its mode from env the sandbox strips, so
// these tests put their own claude on PATH: version 9.9.9, passing both probe
// runs (stream-json) and answering the draft step with VALID_DRAFT.
const PASSING_CLAUDE = `#!/usr/bin/env node
if (process.argv[2] === '--version') {
  console.log('9.9.9 (Claude Code)')
  process.exit(0)
}
const result = (output) => JSON.stringify({ type: 'result', is_error: false, structured_output: output })
const init = {
  type: 'system', subtype: 'init', cwd: process.cwd(),
  tools: ['StructuredOutput', 'mcp__profile__search_profile'],
  mcp_servers: [{ name: 'profile', status: 'connected' }],
  slash_commands: [], skills: [], plugins: [], agents: [], output_style: 'default',
}
process.stdin.resume()
process.stdin.on('end', () => {
  if (process.argv.includes('stream-json')) {
    console.log(JSON.stringify(init))
    console.log(result({ summary: 'A synthetic ad.' }))
  } else {
    console.log(result(${JSON.stringify(VALID_DRAFT)}))
  }
})
`

const FAILING_CLAUDE = `#!/bin/sh
[ "$1" = --version ] && echo '9.9.9 (Claude Code)' && exit 0
cat > /dev/null
exit 1
`

function installClaude(script: string) {
  const path = join(bin, 'claude')
  rmSync(path)
  writeFileSync(path, script)
  chmodSync(path, 0o755)
}

function expectOneLineError(result: RunResult, status: number, message: string) {
  expect(result.status).toBe(status)
  expect(result.stderr).toBe(`${message}\n`)
  expect(result.stdout).toBe('')
}

function suitableAd() {
  jobApp.ads.push(fakeAd({ id: 1, state: 'suitable', body: 'Ad text' }))
}

test('the named ad is drafted, exit 0', async () => {
  suitableAd()
  installClaude(PASSING_CLAUDE)

  const result = await run()

  expect(result.stderr).toBe('')
  expect(result.stdout).toBe('drafted: ad 1 as application 101\n')
  expect(result.status).toBe(0)
  expect(jobApp.ads[0].state).toBe('drafted')
  expect(existsSync(join(stateDir, 'run.lock'))).toBe(false)
})

test('engine "api" in config still drafts on claude -p and needs no API key', async () => {
  suitableAd()
  installClaude(PASSING_CLAUDE)
  writeConfig(fixture, { ...fixture.config, drafting, engine: 'api' })

  const result = await run()

  expect(result.stdout).toBe('drafted: ad 1 as application 101\n')
  expect(result.status).toBe(0)
})

test('with no check record the probes run first, and the version is recorded', async () => {
  suitableAd()
  installClaude(PASSING_CLAUDE)
  rmSync(join(stateDir, 'sandbox-check.json'))

  const result = await run()

  expect(result.stdout).toBe('sandbox re-verified for claude 9.9.9\ndrafted: ad 1 as application 101\n')
  expect(result.status).toBe(0)
  expect(readCheckRecord(stateDir)?.cliVersion).toBe('9.9.9')
})

test('failing probes exit 1 and leave the ad untouched', async () => {
  suitableAd()
  installClaude(FAILING_CLAUDE)
  rmSync(join(stateDir, 'sandbox-check.json'))

  expectOneLineError(await run(), 1, 'sandbox check failed for claude 9.9.9: benign run, hostile run')
  expect(jobApp.logins).toBe(0)
  expect(jobApp.transitions).toEqual([])
})

test('a failed step exits 1 with the attempt line, and the ad records the attempt', async () => {
  suitableAd()

  const result = await run()

  expect(result.status).toBe(1)
  expect(result.stdout).toBe('drafting failed: Developer 1, testsource: invalid_result (retrying)\n')
  expect(jobApp.transitions).toEqual([{ id: 1, to: 'suitable', error: 'invalid_result' }])
})

test('a lock held by a live run exits 1 before any request', async () => {
  suitableAd()
  const holder = startFakeRunHolder()
  try {
    mkdirSync(stateDir, { recursive: true })
    writeFileSync(join(stateDir, 'run.lock'), String(holder.pid))

    expectOneLineError(await run(), 1, `another run is in progress (pid ${holder.pid})`)
    expect(jobApp.logins).toBe(0)
  } finally {
    holder.stop()
  }
})

test.each([[[]], [['abc']], [['0']], [['1', '2']]])('arguments %j exit 2 with the usage line', async (args) => {
  expectOneLineError(await run(args), 2, 'usage: npm run agent:draft -- <ad id>')
})

test('Ollama down exits 1 with skipped, and leaves the ad alone', async () => {
  suitableAd()
  writeConfig(fixture, { ...fixture.config, ollamaUrl: UNREACHABLE_URL, drafting })

  expectOneLineError(await run(), 1, 'drafting skipped: unreachable')
  expect(jobApp.transitions).toEqual([])
})

test('an ad that is no longer suitable exits 1 and is not touched', async () => {
  jobApp.ads.push(fakeAd({ id: 1, state: 'drafted', body: 'Ad text' }))

  expectOneLineError(await run(), 1, 'ad 1 is drafted, not suitable')
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
