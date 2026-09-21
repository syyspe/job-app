import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { STATUSES } from '../../server/types.ts'
import type { Application } from '../../server/types.ts'
import { checkDateApplied, fetchApplication } from '../lib/applications.ts'
import type { ApiClient } from '../lib/client.ts'
import { jsonResult } from '../lib/results.ts'

const idField = z.number().int().describe('The application id.')

const fields = {
  company: z.string().describe('The company applied to.'),
  role: z.string().describe('The role applied for.'),
  dateApplied: z
    .string()
    .describe('The date the application was sent, YYYY-MM-DD. Only a draft may omit it.'),
  deadline: z.string().describe('The application deadline, YYYY-MM-DD.'),
  status: z.enum(STATUSES).describe(`Where the application stands: ${STATUSES.join(', ')}.`),
  link: z.string().describe('A link to the posting.'),
  notes: z.string().describe('Free-text notes.'),
}

type ApplicationFields = Pick<
  Application,
  'company' | 'role' | 'dateApplied' | 'deadline' | 'status' | 'link' | 'notes'
>

function mergeInput(
  existing: Application,
  given: Partial<ApplicationFields>,
): ApplicationFields {
  return {
    company: given.company ?? existing.company,
    role: given.role ?? existing.role,
    dateApplied: given.dateApplied ?? existing.dateApplied,
    deadline: given.deadline ?? existing.deadline,
    status: given.status ?? existing.status,
    link: given.link ?? existing.link,
    notes: given.notes ?? existing.notes,
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
        company: fields.company,
        role: fields.role,
        dateApplied: fields.dateApplied.default(''),
        deadline: fields.deadline.default(''),
        status: fields.status.default('applied'),
        link: fields.link.default(''),
        notes: fields.notes.default(''),
      },
    },
    async (input) => {
      checkDateApplied(input)
      return jsonResult(await client.sendJson<Application>('POST', '/api/applications', input))
    },
  )
}

function registerUpdate(server: McpServer, client: ApiClient): void {
  server.registerTool(
    'update_application',
    {
      description:
        'Update a job application. Fields left out keep their current value; ' +
        'an empty string clears an optional one.',
      inputSchema: {
        id: idField,
        company: fields.company.optional(),
        role: fields.role.optional(),
        dateApplied: fields.dateApplied.optional(),
        deadline: fields.deadline.optional(),
        status: fields.status.optional(),
        link: fields.link.optional(),
        notes: fields.notes.optional(),
      },
    },
    async ({ id, ...given }) => {
      const existing = await fetchApplication(client, id)
      const input = mergeInput(existing, given)
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
  registerUpdate(server, client)
  registerArchive(server, client)
}
