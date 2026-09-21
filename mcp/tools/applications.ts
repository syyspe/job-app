import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { STATUSES } from '../../server/types.ts'
import type { Application } from '../../server/types.ts'
import { checkDateApplied, fetchApplication } from '../lib/applications.ts'
import type { ApiClient } from '../lib/client.ts'
import { jsonResult } from '../lib/results.ts'

const idField = z.number().int().describe('The application id.')

const statusField = z
  .enum(STATUSES)
  .describe(`Where the application stands: ${STATUSES.join(', ')}.`)

function toInput(application: Application) {
  return {
    company: application.company,
    role: application.role,
    dateApplied: application.dateApplied,
    deadline: application.deadline,
    status: application.status,
    link: application.link,
    notes: application.notes,
  }
}

function registerList(server: McpServer, client: ApiClient): void {
  server.registerTool(
    'list_applications',
    {
      description: 'List the job applications, each with its attachments.',
      inputSchema: {
        includeArchived: z
          .boolean()
          .default(false)
          .describe('Include archived applications as well as live ones.'),
      },
    },
    async ({ includeArchived }) => {
      const applications = await client.getJson<Application[]>('/api/applications')
      if (includeArchived) return jsonResult(applications)
      return jsonResult(applications.filter((application) => !application.archived))
    },
  )
}

function registerGet(server: McpServer, client: ApiClient): void {
  server.registerTool(
    'get_application',
    {
      description: 'Read one job application by id, with its attachments.',
      inputSchema: { id: idField },
    },
    async ({ id }) => jsonResult(await fetchApplication(client, id)),
  )
}

function registerCreate(server: McpServer, client: ApiClient): void {
  server.registerTool(
    'create_application',
    {
      description: 'File a new job application.',
      inputSchema: {
        company: z.string().describe('The company applied to.'),
        role: z.string().describe('The role applied for.'),
        dateApplied: z
          .string()
          .default('')
          .describe('The date the application was sent, YYYY-MM-DD. Only a draft may omit it.'),
        deadline: z.string().default('').describe('The application deadline, YYYY-MM-DD.'),
        status: statusField.default('applied'),
        link: z.string().default('').describe('A link to the posting.'),
        notes: z.string().default('').describe('Free-text notes.'),
      },
    },
    async (input) => {
      checkDateApplied(input)
      return jsonResult(await client.sendJson<Application>('POST', '/api/applications', input))
    },
  )
}

function registerSetStatus(server: McpServer, client: ApiClient): void {
  server.registerTool(
    'set_application_status',
    {
      description: 'Move an application to another status, leaving its other fields alone.',
      inputSchema: { id: idField, status: statusField },
    },
    async ({ id, status }) => {
      const existing = await fetchApplication(client, id)
      const input = { ...toInput(existing), status }
      checkDateApplied(input)
      return jsonResult(
        await client.sendJson<Application>('PUT', `/api/applications/${id}`, input),
      )
    },
  )
}

function registerArchive(server: McpServer, client: ApiClient): void {
  server.registerTool(
    'archive_application',
    {
      description: 'Archive an application, or bring it back out of the archive.',
      inputSchema: {
        id: idField,
        archived: z.boolean().describe('True to archive, false to unarchive.'),
      },
    },
    async ({ id, archived }) => {
      await fetchApplication(client, id)
      return jsonResult(
        await client.sendJson<Application>('PUT', `/api/applications/${id}/archived`, {
          archived,
        }),
      )
    },
  )
}

export function registerApplicationTools(server: McpServer, client: ApiClient): void {
  registerList(server, client)
  registerGet(server, client)
  registerCreate(server, client)
  registerSetStatus(server, client)
  registerArchive(server, client)
}
