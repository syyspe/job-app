import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { CliError } from '../../lib/cliError.ts'

// Signal 0 checks for the process without touching it; EPERM means it exists
// under another user.
function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
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

// One run at a time. A lock whose holder has exited is stale: removed and
// taken once more.
export function acquireRunLock(stateDir: string): () => void {
  mkdirSync(stateDir, { recursive: true })
  const path = join(stateDir, 'run.lock')
  if (!createLockFile(path)) {
    const pid = holderPid(path)
    if (pid !== undefined && isRunning(pid)) throw new CliError(1, `another run is in progress (pid ${pid})`)
    rmSync(path)
    if (!createLockFile(path)) throw new CliError(1, 'another run took the lock')
  }
  return () => rmSync(path, { force: true })
}
