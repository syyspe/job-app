import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { CliError } from '../../lib/cliError.ts'

const RUN_SCRIPTS = [
  'agent/runner/commands/run.ts',
  'agent/runner/commands/collect.ts',
  'agent/runner/commands/draft.ts',
]

// A pid alone isn't enough: after a reboot a stale lock's pid can belong to
// an unrelated process. The holder counts only while it still runs agent:run,
// agent:collect or agent:draft.
function isRun(pid: number): boolean {
  try {
    const args = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0')
    return args.some((arg) => RUN_SCRIPTS.some((script) => arg.endsWith(script)))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    return false
  }
}

// A pid of 0 or below would address a process group, so it counts as unreadable.
function holderPid(path: string): number | undefined {
  const pid = Number(readFileSync(path, 'utf8').trim())
  return Number.isInteger(pid) && pid > 0 ? pid : undefined
}

function createLockFile(path: string): boolean {
  try {
    const fd = openSync(path, 'wx')
    writeSync(fd, String(process.pid))
    closeSync(fd)
    return true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    return false
  }
}

// One run at a time. A lock whose holder is no longer agent:run,
// agent:collect or agent:draft is stale: removed and taken once more.
export function acquireRunLock(stateDir: string): () => void {
  mkdirSync(stateDir, { recursive: true })
  const path = join(stateDir, 'run.lock')
  if (!createLockFile(path)) {
    const pid = holderPid(path)
    if (pid !== undefined && isRun(pid)) throw new CliError(1, `another run is in progress (pid ${pid})`)
    rmSync(path)
    if (!createLockFile(path)) throw new CliError(1, 'another run took the lock')
  }
  return () => rmSync(path, { force: true })
}
