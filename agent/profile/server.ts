import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { SearchRequest, SearchResult } from './lib/search.ts'
import { SEARCH_PROFILE_DESCRIPTION, searchRequestShape } from './lib/searchTool.ts'

export function createProfileServer(search: (request: SearchRequest) => Promise<SearchResult[]>): McpServer {
  const server = new McpServer({ name: 'job-agent-profile', version: '0.1.0' })
  server.registerTool(
    'search_profile',
    {
      description: SEARCH_PROFILE_DESCRIPTION,
      inputSchema: searchRequestShape,
      annotations: { readOnlyHint: true },
    },
    async (request) => ({
      content: [{ type: 'text', text: JSON.stringify(await search(request), null, 2) }],
    }),
  )
  return server
}
