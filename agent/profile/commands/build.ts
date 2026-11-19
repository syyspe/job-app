// npm run profile:index — checks Ollama, then builds the index incrementally.
import { CliError, runCommand } from '../../lib/cliError.ts'
import { configPath, indexPath } from '../../lib/paths.ts'
import { buildIndex, formatBuildSummary } from '../lib/build.ts'
import { loadProfileConfig } from '../lib/config.ts'
import { listCorpusFiles } from '../lib/corpus.ts'
import { checkOllama, createOllama } from '../lib/ollama.ts'
import { openIndex } from '../lib/store.ts'

await runCommand(async () => {
  const config = loadProfileConfig(configPath(process.env))
  const { files, skipped } = listCorpusFiles(config.corpus)
  const health = await checkOllama(config)
  if (!health.ok) throw new CliError(1, `Ollama health check failed: ${health.reason}`)
  const store = openIndex(indexPath(process.env))
  try {
    const ollama = createOllama({ url: config.ollamaUrl, model: config.embeddingModel })
    const summary = await buildIndex({ files, store, ollama, model: config.embeddingModel })
    for (const line of formatBuildSummary(summary, skipped)) console.log(line)
  } finally {
    store.close()
  }
})
