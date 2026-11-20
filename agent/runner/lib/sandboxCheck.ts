import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { CliError } from '../../lib/cliError.ts'
import type { Probe } from './sandboxProbes.ts'

export interface CheckRecord {
  cliVersion: string
  checkedAt: string
}

const recordSchema = z.object({ cliVersion: z.string(), checkedAt: z.string() })

function recordPath(stateDir: string): string {
  return join(stateDir, 'sandbox-check.json')
}

// `claude --version` prints e.g. "2.1.328 (Claude Code)".
export function installedVersion(claudeBin: string): string {
  try {
    return execFileSync(claudeBin, ['--version'], { encoding: 'utf8' }).trim().split(' ')[0]
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    throw new CliError(2, `${claudeBin} not found on PATH`, { cause: err })
  }
}

export function readCheckRecord(stateDir: string): CheckRecord | undefined {
  try {
    return recordSchema.parse(JSON.parse(readFileSync(recordPath(stateDir), 'utf8')))
  } catch {
    // Missing or unreadable: either way the check has to run again.
    return undefined
  }
}

export function writeCheckRecord(stateDir: string, record: CheckRecord): void {
  mkdirSync(stateDir, { recursive: true })
  writeFileSync(recordPath(stateDir), `${JSON.stringify(record, null, 2)}\n`)
}

// Evaluation runs only on a CLI version the sandbox check has passed against.
export function requirePassedCheck(claudeBin: string, stateDir: string): void {
  const version = installedVersion(claudeBin)
  if (readCheckRecord(stateDir)?.cliVersion === version) return
  throw new CliError(2, `sandbox not verified for claude ${version}: run npm run agent:sandbox-check`)
}

export interface VerifyOptions {
  version: string
  stateDir: string
  runProbes: () => Promise<Probe[]>
  now: () => Date
}

export interface Verification {
  probes: Probe[]
  passed: boolean
}

// Records the version only when every probe passes.
export async function verifySandbox({ version, stateDir, runProbes, now }: VerifyOptions): Promise<Verification> {
  const probes = await runProbes()
  const passed = probes.every((probe) => probe.ok)
  if (passed) writeCheckRecord(stateDir, { cliVersion: version, checkedAt: now().toISOString() })
  return { probes, passed }
}

export interface EnsureOptions {
  claudeBin: string
  stateDir: string
  runProbes: () => Promise<Probe[]>
  now: () => Date
}

// agent:run's gate: after a CLI update it runs the probes itself instead of
// refusing. A failure records nothing, so the next run probes again.
export async function ensureSandboxVerified(options: EnsureOptions): Promise<{ version: string; reverified: boolean }> {
  const version = installedVersion(options.claudeBin)
  if (readCheckRecord(options.stateDir)?.cliVersion === version) return { version, reverified: false }
  const { probes, passed } = await verifySandbox({ ...options, version })
  if (!passed) {
    const failed = probes.filter((probe) => !probe.ok).map((probe) => probe.property)
    throw new CliError(1, `sandbox check failed for claude ${version}: ${failed.join(', ')}`)
  }
  return { version, reverified: true }
}
