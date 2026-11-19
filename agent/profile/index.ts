// The stdio MCP server the `claude -p` steps get as their only tool. Nothing
// here may write to stdout: that is the JSON-RPC channel.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { runCommand } from '../lib/cliError.ts'
import { configPath, indexPath } from '../lib/paths.ts'
import { loadProfileConfig } from './lib/config.ts'
import { createOllama } from './lib/ollama.ts'
import { searchIndexFile } from './lib/search.ts'
import { createProfileServer } from './server.ts'

await runCommand(async () => {
  const config = loadProfileConfig(configPath(process.env))
  const indexFile = indexPath(process.env)
  const deps = {
    ollama: createOllama({ url: config.ollamaUrl, model: config.embeddingModel }),
    model: config.embeddingModel,
  }
  const server = createProfileServer((request) => searchIndexFile(indexFile, deps, request))
  await server.connect(new StdioServerTransport())
})
