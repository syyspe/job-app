// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { UNREACHABLE_URL } from '../../test/fakeOllama.ts'
import { startFakeJobApp } from '../../test/fakeJobApp.ts'
import type { FakeJobApp } from '../../test/fakeJobApp.ts'
import { closeProfileFixture, runNode, startProfileFixture, writeConfig } from '../../test/profileFixture.ts'
import type { ProfileFixture, RunResult } from '../../test/profileFixture.ts'

const command = join(import.meta.dirname, 'sync.ts')
let fixture: ProfileFixture
let jobApp: FakeJobApp
let syncFolder: string
let envFile: string

beforeEach(async () => {
  fixture = await startProfileFixture()
  jobApp = await startFakeJobApp()
  syncFolder = join(fixture.dir.root, 'corpus/synced')
  writeConfig(fixture, { ...fixture.config, syncFolder })
  envFile = writeEnv({ JOBAPP_API_URL: jobApp.url, JOBAPP_USERNAME: jobApp.username, JOBAPP_PASSWORD: jobApp.password })
})

afterEach(async () => {
  await jobApp.close()
  await closeProfileFixture(fixture)
})

function writeEnv(values: Record<string, string>): string {
  const text = Object.entries(values).map(([name, value]) => `${name}=${value}\n`).join('')
  return fixture.dir.write('.config/job-agent/env', text)
}

function run() {
  return runNode(command, [], fixture.env)
}

function expectOneLineError(result: RunResult, status: number, message: string) {
  expect(result.status).toBe(status)
  expect(result.stderr).toBe(`${message}\n`)
  expect(result.stdout).toBe('')
}

test('a marked attachment is synced, indexed and reported', async () => {
  jobApp.attachments.push({ id: 5, originalName: 'letter 2026.md', content: 'Dear team', pending: true })

  const result = await run()

  expect(result.stderr).toBe('')
  expect(result.status).toBe(0)
  expect(result.stdout).toBe(
    'synced 1 attachments\n  5-letter_2026.md\nadded 3, updated 0, removed 0, unchanged 0; 3 chunks embedded\n',
  )
  expect(jobApp.flagCalls).toEqual([{ id: 5, pending: false, storedName: '5.bin' }])
})

test('nothing marked still creates the folder and builds', async () => {
  const result = await run()

  expect(result.status).toBe(0)
  expect(result.stdout).toBe('synced 0 attachments\nadded 2, updated 0, removed 0, unchanged 0; 2 chunks embedded\n')
  expect(existsSync(syncFolder)).toBe(true)
})

test('a config without syncFolder exits 2', async () => {
  writeConfig(fixture, fixture.config)
  const path = join(fixture.dir.root, '.config/job-agent/config.json')

  expectOneLineError(await run(), 2, `${path}: syncFolder is required for profile:sync`)
})

test('a missing env file exits 2', async () => {
  rmSync(envFile)

  expectOneLineError(await run(), 2, `${envFile}: file not found`)
})

test('an env file missing a variable exits 2 naming it', async () => {
  writeEnv({ JOBAPP_API_URL: jobApp.url, JOBAPP_PASSWORD: jobApp.password })

  expectOneLineError(await run(), 2, `${envFile}: JOBAPP_USERNAME is not set`)
})

test('an unreachable Ollama exits 1 before copying or clearing anything', async () => {
  jobApp.attachments.push({ id: 5, originalName: 'letter.md', content: 'Dear team', pending: true })
  writeConfig(fixture, { ...fixture.config, syncFolder, ollamaUrl: UNREACHABLE_URL })

  expectOneLineError(await run(), 1, 'Ollama health check failed: unreachable')
  expect(existsSync(syncFolder)).toBe(false)
  expect(jobApp.logins).toBe(0)
})

test('a rejected login exits 1 without printing the password', async () => {
  writeEnv({ JOBAPP_API_URL: jobApp.url, JOBAPP_USERNAME: jobApp.username, JOBAPP_PASSWORD: 'wrong-secret' })

  const result = await run()

  expectOneLineError(result, 1, `job-app login failed: check JOBAPP_USERNAME and JOBAPP_PASSWORD in ${envFile}`)
})

test('an unreachable job-app exits 1', async () => {
  writeEnv({ JOBAPP_API_URL: UNREACHABLE_URL, JOBAPP_USERNAME: 'runner', JOBAPP_PASSWORD: 'x' })

  expectOneLineError(await run(), 1, `cannot reach job-app at ${UNREACHABLE_URL}`)
})

test('an embed failure exits 1 and leaves the mark set', async () => {
  jobApp.attachments.push({ id: 5, originalName: 'letter.md', content: 'Dear team', pending: true })
  fixture.fake.failure = 'status'

  expectOneLineError(await run(), 1, 'Ollama embedding failed: 500')
  expect(jobApp.flagCalls).toEqual([])
  expect(existsSync(join(syncFolder, '5-letter.md'))).toBe(true)
})
