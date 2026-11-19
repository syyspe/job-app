// npm run profile:search -- "<query>" [facts|style] — prints the top results.
import { CliError, runCommand } from '../../lib/cliError.ts'
import { configPath, indexPath } from '../../lib/paths.ts'
import { LABELS, loadProfileConfig } from '../lib/config.ts'
import type { Label } from '../lib/config.ts'
import { createOllama } from '../lib/ollama.ts'
import { searchIndexFile } from '../lib/search.ts'

const USAGE = 'usage: npm run profile:search -- "<query>" [facts|style]'

function parseArgs(args: string[]): { query: string; label?: Label } {
  const [query, label, ...rest] = args
  if (!query || rest.length > 0) throw new CliError(2, USAGE)
  if (label === undefined) return { query }
  if (!(LABELS as readonly string[]).includes(label)) throw new CliError(2, USAGE)
  return { query, label: label as Label }
}

await runCommand(async () => {
  const request = parseArgs(process.argv.slice(2))
  const config = loadProfileConfig(configPath(process.env))
  const deps = { ollama: createOllama({ url: config.ollamaUrl, model: config.embeddingModel }), model: config.embeddingModel }
  const results = await searchIndexFile(indexPath(process.env), deps, { ...request, limit: 5 })
  for (const result of results) {
    console.log(`${result.score.toFixed(3)}  ${result.label}  ${result.source}`)
    console.log(`  ${result.text.replaceAll('\n', '\n  ')}\n`)
  }
})
