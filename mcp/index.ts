import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createApiClient } from './lib/client.ts'
import { createMcpServer } from './server.ts'

const baseUrl = process.env.JOBAPP_API_URL
const username = process.env.JOBAPP_USERNAME
const password = process.env.JOBAPP_PASSWORD
if (!baseUrl || !username || !password) {
  console.error('JOBAPP_API_URL, JOBAPP_USERNAME and JOBAPP_PASSWORD must all be set')
  process.exit(2)
}

const server = createMcpServer(createApiClient({ baseUrl, username, password }))
await server.connect(new StdioServerTransport())
