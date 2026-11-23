import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ApiClient } from './lib/client.ts'
import { registerAdTools } from './tools/ads.ts'
import { registerApplicationTools } from './tools/applications.ts'
import { registerAttachmentTools } from './tools/attachments.ts'
import { registerQuestionTools } from './tools/questions.ts'

export function createMcpServer(client: ApiClient): McpServer {
  const server = new McpServer({ name: 'job-applications', version: '0.1.0' })
  registerApplicationTools(server, client)
  registerAttachmentTools(server, client)
  registerQuestionTools(server, client)
  registerAdTools(server, client)
  return server
}
