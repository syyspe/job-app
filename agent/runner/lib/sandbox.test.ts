// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { makeTempDir } from '../../test/tempDir.ts'
import type { TempDir } from '../../test/tempDir.ts'
import { z } from 'zod'
import { runSandboxed, sandboxArgs, sandboxEnv, stepSchema } from './sandbox.ts'
import type { SandboxStep } from './sandbox.ts'

const fakeClaude = join(import.meta.dirname, '..', '..', 'test', 'fakeClaude.ts')
let dir: TempDir
let logFile: string

beforeEach(() => {
  dir = makeTempDir()
  logFile = join(dir.root, 'claude.log')
})

afterEach(() => {
  dir.remove()
})

interface FakeRecord {
  argv: string[]
  env: Record<string, string>
  cwd: string
  cwdEntries: string[]
  stdin: string
  pid: number
}

function step(mode: string, overrides: Partial<SandboxStep> = {}): SandboxStep {
  return {
    claudeBin: fakeClaude,
    prompt: 'Evaluate the job ad given on standard input.',
    systemPrompt: 'framing',
    input: '{"title":"Developer"}',
    schema: { type: 'object' },
    timeoutMs: 5000,
    env: {
      PATH: process.env.PATH,
      HOME: dir.root,
      JOBAPP_PASSWORD: 'canary-password',
      ANTHROPIC_API_KEY: 'canary-key',
      FAKE_CLAUDE_LOG: logFile,
      FAKE_CLAUDE_MODE: mode,
      FAKE_CLAUDE_OUTPUT: '{"verdict":"suitable"}',
    },
    extraEnv: ['FAKE_CLAUDE_LOG', 'FAKE_CLAUDE_MODE', 'FAKE_CLAUDE_OUTPUT'],
    ...overrides,
  }
}

function record(): FakeRecord {
  return JSON.parse(readFileSync(logFile, 'utf8')) as FakeRecord
}

function flagValue(argv: string[], flag: string): string {
  return argv[argv.indexOf(flag) + 1]
}

test('an ok run returns the structured output', async () => {
  expect(await runSandboxed(step('ok'))).toEqual({ kind: 'ok', output: { verdict: 'suitable' } })
})

test('argv carries every contract flag and never --bare', async () => {
  await runSandboxed(step('ok'))
  const { argv } = record()

  expect(argv).toEqual(
    expect.arrayContaining(['-p', '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence']),
  )
  expect(flagValue(argv, '--output-format')).toBe('json')
  expect(flagValue(argv, '--json-schema')).toBe('{"type":"object"}')
  expect(flagValue(argv, '--system-prompt')).toBe('framing')
  expect(flagValue(argv, '--tools')).toBe('')
  expect(flagValue(argv, '--allowedTools')).toBe('mcp__profile__search_profile')
  expect(flagValue(argv, '--permission-mode')).toBe('dontAsk')
  expect(flagValue(argv, '--setting-sources')).toBe('')
  expect(argv).not.toContain('--bare')
})

test('the MCP config names only the profile server, with the allowlisted env', async () => {
  await runSandboxed(step('ok'))
  const config = JSON.parse(flagValue(record().argv, '--mcp-config')) as {
    mcpServers: Record<string, { command: string; args: string[]; env: Record<string, string> }>
  }

  expect(Object.keys(config.mcpServers)).toEqual(['profile'])
  expect(config.mcpServers.profile.command).toBe(process.execPath)
  expect(config.mcpServers.profile.args[0]).toMatch(/agent\/profile\/index\.ts$/)
  expect(config.mcpServers.profile.env.JOBAPP_PASSWORD).toBeUndefined()
})

test('secrets in the parent env do not reach the child', async () => {
  await runSandboxed(step('ok'))
  const { env } = record()

  expect(env.JOBAPP_PASSWORD).toBeUndefined()
  expect(env.ANTHROPIC_API_KEY).toBeUndefined()
  expect(env.HOME).toBe(dir.root)
})

test('the child runs in an empty directory that is gone afterwards', async () => {
  await runSandboxed(step('ok'))
  const { cwd, cwdEntries } = record()

  expect(cwdEntries).toEqual([])
  expect(existsSync(cwd)).toBe(false)
})

test('stdin carries the input', async () => {
  await runSandboxed(step('ok'))

  expect(record().stdin).toBe('{"title":"Developer"}')
})

test('a hang becomes timeout and the child is killed', async () => {
  const result = await runSandboxed(step('hang', { timeoutMs: 1000 }))

  expect(result).toEqual({ kind: 'failed', category: 'timeout' })
  expect(() => process.kill(record().pid, 0)).toThrow()
})

test.each([
  ['exit1', 'cli_failed'],
  ['is_error', 'cli_failed'],
  ['garbage', 'bad_output'],
])('a %s run becomes %s', async (mode, category) => {
  expect(await runSandboxed(step(mode))).toEqual({ kind: 'failed', category })
})

test('the allowlist keeps only its names, plus any extra ones', () => {
  const env = { PATH: '/bin', HOME: '/h', TZ: 'UTC', JOBAPP_PASSWORD: 'x', OTHER: 'y' }

  expect(sandboxEnv(env)).toEqual({ PATH: '/bin', HOME: '/h', TZ: 'UTC' })
  expect(sandboxEnv(env, ['OTHER'])).toEqual({ PATH: '/bin', HOME: '/h', TZ: 'UTC', OTHER: 'y' })
})

test('stream-json output adds --verbose', () => {
  const args = sandboxArgs({ prompt: 'p', systemPrompt: 's', schema: {}, mcpConfig: '{}', outputFormat: 'stream-json' })

  expect(args.slice(args.indexOf('--output-format'), args.indexOf('--output-format') + 3)).toEqual([
    '--output-format',
    'stream-json',
    '--verbose',
  ])
})

test('a step schema carries no $schema key, which the CLI rejects', () => {
  expect(stepSchema(z.object({ summary: z.string() }))).toEqual({
    type: 'object',
    properties: { summary: { type: 'string' } },
    required: ['summary'],
    additionalProperties: false,
  })
})
