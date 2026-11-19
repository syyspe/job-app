// npm run profile:health — prints ok, or the reason Ollama is not usable.
import { CliError, runCommand } from '../../lib/cliError.ts'
import { configPath } from '../../lib/paths.ts'
import { loadProfileConfig } from '../lib/config.ts'
import { checkOllama } from '../lib/ollama.ts'

await runCommand(async () => {
  const health = await checkOllama(loadProfileConfig(configPath(process.env)))
  if (!health.ok) throw new CliError(1, health.reason)
  console.log('ok')
})
