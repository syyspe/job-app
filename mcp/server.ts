import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ApiClient } from './lib/client.ts'
import { registerApplicationTools } from './tools/applications.ts'
import { registerAttachmentTools } from './tools/attachments.ts'

export function createMcpServer(client: ApiClient): McpServer {
  const server = new McpServer({ name: 'job-applications', version: '0.1.0' })
  registerApplicationTools(server, client)
  registerAttachmentTools(server, client)
  return server
}
