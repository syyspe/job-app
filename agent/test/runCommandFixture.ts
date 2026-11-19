// Spawned by cliError.test.ts: runs runCommand with the failure argv names.
import { CliError, runCommand } from '../lib/cliError.ts'

await runCommand(async () => {
  if (process.argv[2] === 'cli') throw new CliError(2, 'config.json: corpus is required')
  throw new Error('unexpected failure')
})
