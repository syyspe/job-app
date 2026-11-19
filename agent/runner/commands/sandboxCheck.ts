// npm run agent:sandbox-check — proves the claude -p sandbox against the
// installed CLI and records the version it passed for agent:evaluate.
import { runCommand } from '../../lib/cliError.ts'
import { stateDir } from '../../lib/paths.ts'
import { runProbes } from '../lib/sandboxProbes.ts'
import { installedVersion, writeCheckRecord } from '../lib/sandboxCheck.ts'

const CLAUDE_BIN = 'claude'

await runCommand(async () => {
  const version = installedVersion(CLAUDE_BIN)
  console.log(`checking the sandbox against claude ${version}`)
  const probes = await runProbes({ claudeBin: CLAUDE_BIN, env: process.env, timeoutMs: 180000 })
  for (const { property, ok, detail } of probes) console.log(ok ? `pass  ${property}` : `FAIL  ${property}: ${detail}`)
  if (probes.some((probe) => !probe.ok)) {
    console.log('sandbox check failed; nothing recorded')
    process.exitCode = 1
    return
  }
  writeCheckRecord(stateDir(process.env), { cliVersion: version, checkedAt: new Date().toISOString() })
  console.log(`sandbox verified for claude ${version}`)
})
