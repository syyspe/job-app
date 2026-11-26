import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { Env } from '../../lib/paths.ts'

// ANTHROPIC_API_KEY is left out on purpose, so a step never switches off the
// subscription login. Nothing job-app or mail related is ever on this list.
const ALLOWED_ENV = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TZ', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'CLAUDE_CONFIG_DIR']

const PROFILE_SERVER = fileURLToPath(new URL('../../profile/index.ts', import.meta.url))

export type OutputFormat = 'json' | 'stream-json'

export interface SandboxArgsOptions {
  prompt: string
  systemPrompt: string
  schema: object
  mcpConfig: string
  outputFormat: OutputFormat
}

export interface SandboxStep {
  claudeBin: string
  prompt: string
  systemPrompt: string
  input: string
  schema: object
  timeoutMs: number
  // The runner's own environment; only the allowlist reaches the step.
  env: Env
  // Tests only: names let through on top of the allowlist.
  extraEnv?: string[]
  // Where the step's empty working directory is made; the OS temp dir by default.
  workRoot?: string
}

export type FailureCategory = 'timeout' | 'model_failed' | 'bad_output'

// `detail` is the API's status and message, for this run's output only.
export type SandboxResult =
  | { kind: 'ok'; output: unknown }
  | { kind: 'failed'; category: FailureCategory; detail?: string }

export type RawRun = { kind: 'exited'; code: number | null; stdout: string; cwd: string } | { kind: 'timeout' }

// The CLI rejects the `$schema` key z.toJSONSchema writes, so it is dropped.
// The API rejects `maxItems`, so that goes too; the zod check still applies it.
export function stepSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _dialect, ...rest } = z.toJSONSchema(schema, {
    override: (ctx) => {
      delete ctx.jsonSchema.maxItems
    },
  })
  return rest
}

export function sandboxEnv(env: Env, extra: string[] = []): Record<string, string> {
  const allowed: Record<string, string> = {}
  for (const name of [...ALLOWED_ENV, ...extra]) {
    const value = env[name]
    if (value !== undefined) allowed[name] = value
  }
  return allowed
}

export function profileMcpConfig(env: Record<string, string>): string {
  const server = { type: 'stdio', command: process.execPath, args: [PROFILE_SERVER], env }
  return JSON.stringify({ mcpServers: { profile: server } })
}

// The one argument list every step runs with. Never --bare: it does not read
// the subscription login.
export function sandboxArgs(options: SandboxArgsOptions): string[] {
  const output = options.outputFormat === 'stream-json' ? ['stream-json', '--verbose'] : ['json']
  return [
    '-p', options.prompt,
    '--output-format', ...output,
    '--json-schema', JSON.stringify(options.schema),
    '--system-prompt', options.systemPrompt,
    '--tools', '',
    '--strict-mcp-config', '--mcp-config', options.mcpConfig,
    '--allowedTools', 'mcp__profile__search_profile',
    '--permission-mode', 'dontAsk',
    '--setting-sources', '',
    '--disable-slash-commands',
    '--no-session-persistence',
  ]
}

function runIn(cwd: string, step: SandboxStep, outputFormat: OutputFormat): Promise<RawRun> {
  const env = sandboxEnv(step.env, step.extraEnv)
  const args = sandboxArgs({ ...step, mcpConfig: profileMcpConfig(env), outputFormat })
  return new Promise((resolve, reject) => {
    const child = spawn(step.claudeBin, args, { cwd, env, stdio: ['pipe', 'pipe', 'ignore'] })
    let stdout = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, step.timeoutMs)
    // Decoded as a stream, so a character split across two chunks stays whole.
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (data: string) => (stdout += data))
    child.on('error', reject)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve(timedOut ? { kind: 'timeout' } : { kind: 'exited', code, stdout, cwd })
    })
    // A child that exits before reading its input closes the pipe; its exit
    // status is what the caller acts on, not the write error.
    child.stdin.on('error', () => {})
    child.stdin.end(step.input)
  })
}

// Starts one step in a fresh empty directory, removed again afterwards.
export async function spawnSandboxed(step: SandboxStep, outputFormat: OutputFormat): Promise<RawRun> {
  const cwd = mkdtempSync(join(step.workRoot ?? tmpdir(), 'job-agent-step-'))
  try {
    return await runIn(cwd, step, outputFormat)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
}

const envelopeSchema = z.object({
  type: z.literal('result'),
  is_error: z.boolean(),
  structured_output: z.record(z.string(), z.unknown()).optional(),
})

function parseEnvelope(stdout: string): z.infer<typeof envelopeSchema> | undefined {
  try {
    return envelopeSchema.parse(JSON.parse(stdout))
  } catch {
    return undefined
  }
}

// A usage limit is not marked distinctly in the CLI's JSON result, so it
// counts as model_failed like any other failed run.
export async function runSandboxed(step: SandboxStep): Promise<SandboxResult> {
  const run = await spawnSandboxed(step, 'json')
  if (run.kind === 'timeout') return { kind: 'failed', category: 'timeout' }
  if (run.code !== 0) return { kind: 'failed', category: 'model_failed' }
  const envelope = parseEnvelope(run.stdout)
  if (!envelope) return { kind: 'failed', category: 'bad_output' }
  if (envelope.is_error) return { kind: 'failed', category: 'model_failed' }
  if (!envelope.structured_output) return { kind: 'failed', category: 'bad_output' }
  return { kind: 'ok', output: envelope.structured_output }
}
