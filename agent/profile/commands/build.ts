// npm run profile:index — checks Ollama, then builds the index incrementally.
import { CliError, runCommand } from '../../lib/cliError.ts'
import { configPath, indexPath } from '../../lib/paths.ts'
import { buildIndex } from '../lib/build.ts'
import type { BuildSummary } from '../lib/build.ts'
import { loadProfileConfig } from '../lib/config.ts'
import { listCorpusFiles } from '../lib/corpus.ts'
import { checkOllama, createOllama } from '../lib/ollama.ts'
import { openIndex } from '../lib/store.ts'

function printSummary(summary: BuildSummary, skipped: string[]): void {
  const { added, updated, removed, unchanged, chunks } = summary
  console.log(`added ${added}, updated ${updated}, removed ${removed}, unchanged ${unchanged}; ${chunks} chunks embedded`)
  if (skipped.length === 0) return
  console.log('skipped, not .txt or .md:')
  for (const path of skipped) console.log(`  ${path}`)
}

await runCommand(async () => {
  const config = loadProfileConfig(configPath(process.env))
  const { files, skipped } = listCorpusFiles(config.corpus)
  const health = await checkOllama(config)
  if (!health.ok) throw new CliError(1, `Ollama health check failed: ${health.reason}`)
  const store = openIndex(indexPath(process.env))
  try {
    const ollama = createOllama({ url: config.ollamaUrl, model: config.embeddingModel })
    printSummary(await buildIndex({ files, store, ollama, model: config.embeddingModel }), skipped)
  } finally {
    store.close()
  }
})
