import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { LABELS } from './lib/config.ts'
import type { SearchRequest, SearchResult } from './lib/search.ts'

const DESCRIPTION =
  "Search the user's own application material (CVs, cover letters, notes) for the passages " +
  'closest to a query. Every result carries a label: "facts" results are the source of truth ' +
  'about the user, while "style" results are earlier letters kept only as examples of tone and ' +
  'phrasing — they may contain errors and never supply a fact. Pass a label to search only one kind.'

export function createProfileServer(search: (request: SearchRequest) => Promise<SearchResult[]>): McpServer {
  const server = new McpServer({ name: 'job-agent-profile', version: '0.1.0' })
  server.registerTool(
    'search_profile',
    {
      description: DESCRIPTION,
      inputSchema: {
        query: z.string().min(1).max(2000).describe('What to look for, in any language.'),
        label: z.enum(LABELS).optional().describe('Only results with this label: facts or style.'),
        limit: z.number().int().min(1).max(20).default(5).describe('How many results, 1–20.'),
      },
      annotations: { readOnlyHint: true },
    },
    async (request) => ({
      content: [{ type: 'text', text: JSON.stringify(await search(request), null, 2) }],
    }),
  )
  return server
}
