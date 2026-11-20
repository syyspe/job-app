import { spawn } from 'node:child_process'

export interface FakeRunHolder {
  pid: number
  stop: () => void
}

// A live process whose command line names agent:run's script, as a real
// run holding the lock would. spawn() returns after exec, so /proc already
// shows the new command line.
export function startFakeRunHolder(): FakeRunHolder {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 60000)', 'agent/runner/commands/run.ts'], {
    stdio: 'ignore',
  })
  return { pid: child.pid as number, stop: () => child.kill() }
}
