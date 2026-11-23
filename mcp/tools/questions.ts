import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { OpenQuestion } from '../../server/types.ts'
import { fetchApplication } from '../lib/applications.ts'
import type { ApiClient } from '../lib/client.ts'
import { jsonResult } from '../lib/results.ts'

const applicationId = z.number().int().describe('The application the draft belongs to.')

function registerList(server: McpServer, client: ApiClient): void {
  server.registerTool(
    'list_open_questions',
    {
      description:
        'List a draft\'s open questions: the [[ASK:qN]] markers still left in its .md attachments, ' +
        'with each question\'s text from the notes (null when the notes no longer have it).',
      inputSchema: { applicationId },
    },
    async ({ applicationId: id }) => {
      await fetchApplication(client, id)
      return jsonResult(await client.getJson<OpenQuestion[]>(`/api/applications/${id}/questions`))
    },
  )
}

function registerAnswer(server: McpServer, client: ApiClient): void {
  server.registerTool(
    'answer_questions',
    {
      description:
        'Answer open questions by id. Each answer replaces its markers in every current .md ' +
        'attachment (the first save writes an "(edited)" copy; the original is kept) and is ' +
        'noted under the question in the notes. A blank answer leaves the question open. ' +
        'Returns the questions still open.',
      inputSchema: {
        applicationId,
        answers: z
          .record(z.string(), z.string())
          .describe('Answer text by question id, e.g. {"q1": "…"}.'),
      },
    },
    async ({ applicationId: id, answers }) => {
      await fetchApplication(client, id)
      return jsonResult(
        await client.sendJson<OpenQuestion[]>('POST', `/api/applications/${id}/answers`, { answers }),
      )
    },
  )
}

export function registerQuestionTools(server: McpServer, client: ApiClient): void {
  registerList(server, client)
  registerAnswer(server, client)
}
