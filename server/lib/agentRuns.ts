import type Database from 'better-sqlite3'
import type { Readable } from 'node:stream'
import { createInterface } from 'node:readline'
import { toAgentRun } from '../models/agentRun.ts'
import type { AgentRunRow } from '../models/agentRun.ts'
import type { AgentRun, RunRequest } from '../types.ts'
import type { RunnerSpawner } from './agentRunner.ts'
import type { Logger } from './logger.ts'

// 64 KiB, counted in characters; the tail is what explains how a run ended.
const OUTPUT_CAP = 65536
const RECENT_LIMIT = 10

export interface StartRun {
  request: RunRequest
  userId: number
  runner: RunnerSpawner
  log: Logger
}

function runById(db: Database.Database, id: number): AgentRun {
  const row = db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(id) as AgentRunRow
  return toAgentRun(row)
}

export function currentRun(db: Database.Database): AgentRun | null {
  const row = db.prepare('SELECT * FROM agent_runs WHERE finished_at IS NULL').get() as AgentRunRow | undefined
  return row ? toAgentRun(row) : null
}

export function recentRuns(db: Database.Database): AgentRun[] {
  const rows = db
    .prepare('SELECT * FROM agent_runs WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT ?')
    .all(RECENT_LIMIT) as AgentRunRow[]
  return rows.map(toAgentRun)
}

function appendLine(db: Database.Database, id: number, line: string): void {
  db.prepare('UPDATE agent_runs SET output = substr(output || ?, ?) WHERE id = ?').run(`${line}\n`, -OUTPUT_CAP, id)
}

function finishRun(db: Database.Database, id: number, exitCode: number | null): void {
  db.prepare('UPDATE agent_runs SET finished_at = ?, exit_code = ? WHERE id = ?').run(new Date().toISOString(), exitCode, id)
}

function adIdOf(request: RunRequest): number | null {
  return request.kind === 'draft' ? request.adId : null
}

function insertRun(db: Database.Database, request: RunRequest, userId: number): number {
  const result = db
    .prepare('INSERT INTO agent_runs (kind, ad_id, started_by, started_at) VALUES (?, ?, ?, ?)')
    .run(request.kind, adIdOf(request), userId, new Date().toISOString())
  return Number(result.lastInsertRowid)
}

function appendLines(db: Database.Database, id: number, stream: Readable): void {
  createInterface({ input: stream }).on('line', (line) => appendLine(db, id, line))
}

export function startRun(db: Database.Database, { request, userId, runner, log }: StartRun): AgentRun {
  // Spawned before the insert, so a spawn that throws leaves no open row. Its
  // events fire no earlier than the next tick, after the listeners below.
  const child = runner(request)
  const id = insertRun(db, request, userId)
  const startedMs = Date.now()
  const fields = { runId: id, kind: request.kind, adId: adIdOf(request) }
  log.info('agent run started', { ...fields, startedBy: userId })
  appendLines(db, id, child.stdout as Readable)
  appendLines(db, id, child.stderr as Readable)
  // A child that never started still closes, with a negative errno as its code.
  let started = true
  child.on('error', (err) => {
    started = false
    appendLine(db, id, `(could not start: ${err.message})`)
  })
  child.on('close', (code: number | null) => {
    const exitCode = started ? code : null
    finishRun(db, id, exitCode)
    log.info('agent run finished', { ...fields, exitCode, durationMs: Date.now() - startedMs })
  })
  return runById(db, id)
}

// Their children died with the previous server process.
export function closeInterruptedRuns(db: Database.Database): number {
  const result = db
    .prepare(
      `UPDATE agent_runs SET finished_at = ?, output = substr(output || ?, ?)
       WHERE finished_at IS NULL`,
    )
    .run(new Date().toISOString(), '(server restarted)\n', -OUTPUT_CAP)
  return result.changes
}
