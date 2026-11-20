// npm run agent:sandbox-check — proves the claude -p sandbox against the
// installed CLI and records the version it passed for agent:evaluate.
import { runCommand } from '../../lib/cliError.ts'
import { stateDir } from '../../lib/paths.ts'
import { runProbes } from '../lib/sandboxProbes.ts'
import { installedVersion, verifySandbox } from '../lib/sandboxCheck.ts'

const CLAUDE_BIN = 'claude'

await runCommand(async () => {
  const version = installedVersion(CLAUDE_BIN)
  console.log(`checking the sandbox against claude ${version}`)
  const probe = () => runProbes({ claudeBin: CLAUDE_BIN, env: process.env, timeoutMs: 180000 })
  const now = () => new Date()
  const { probes, passed } = await verifySandbox({ version, stateDir: stateDir(process.env), runProbes: probe, now })
  for (const { property, ok, detail } of probes) console.log(ok ? `pass  ${property}` : `FAIL  ${property}: ${detail}`)
  if (!passed) {
    console.log('sandbox check failed; nothing recorded')
    process.exitCode = 1
    return
  }
  console.log(`sandbox verified for claude ${version}`)
})
