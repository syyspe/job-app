import { z } from 'zod'
import { basename } from 'node:path'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Attachment } from '../../server/types.ts'
import { fetchApplication } from '../lib/applications.ts'
import { ApiError } from '../lib/client.ts'
import type { ApiClient } from '../lib/client.ts'
import { readLocalFile } from '../lib/files.ts'
import { fileResult, jsonResult } from '../lib/results.ts'

async function fileForm(path: string): Promise<FormData> {
  const file = await readLocalFile(path)
  const form = new FormData()
  form.append('file', new File([file.bytes], basename(path), { type: file.mimeType }))
  return form
}

async function namingMissingAttachment<T>(id: number, request: () => Promise<T>): Promise<T> {
  try {
    return await request()
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new Error(`no attachment with id ${id}`)
    }
    throw error
  }
}

function registerAttach(server: McpServer, client: ApiClient): void {
  server.registerTool(
    'attach_file',
    {
      description: 'Upload a local file — a CV, a cover letter — onto an application.',
      inputSchema: {
        applicationId: z.number().int().describe('The application to attach the file to.'),
        path: z.string().describe('Absolute path to the file on this machine.'),
      },
    },
    async ({ applicationId, path }) => {
      await fetchApplication(client, applicationId)
      const form = await fileForm(path)
      return jsonResult(
        await client.sendForm<Attachment>(
          'POST',
          `/api/applications/${applicationId}/attachments`,
          form,
        ),
      )
    },
  )
}

function registerRead(server: McpServer, client: ApiClient): void {
  server.registerTool(
    'read_attachment',
    {
      description:
        'Read an attachment by id. Text comes back as text, anything else as a file.',
      inputSchema: { id: z.number().int().describe('The attachment id.') },
    },
    async ({ id }) => {
      const file = await namingMissingAttachment(id, () =>
        client.getFile(`/api/attachments/${id}`),
      )
      return fileResult(`jobapp://attachments/${id}`, file)
    },
  )
}

function registerDelete(server: McpServer, client: ApiClient): void {
  server.registerTool(
    'delete_attachment',
    {
      description: 'Delete an attachment by id, removing its file.',
      inputSchema: { id: z.number().int().describe('The attachment id.') },
    },
    async ({ id }) => {
      await namingMissingAttachment(id, () => client.remove(`/api/attachments/${id}`))
      return jsonResult({ deleted: id })
    },
  )
}

function registerReplace(server: McpServer, client: ApiClient): void {
  server.registerTool(
    'replace_attachment',
    {
      description:
        'Replace an attachment\'s file with a local file — a newer CV — keeping its id.',
      inputSchema: {
        id: z.number().int().describe('The attachment to replace.'),
        path: z.string().describe('Absolute path to the new file on this machine.'),
      },
    },
    async ({ id, path }) => {
      const form = await fileForm(path)
      return jsonResult(
        await namingMissingAttachment(id, () =>
          client.sendForm<Attachment>('PUT', `/api/attachments/${id}`, form),
        ),
      )
    },
  )
}

export function registerAttachmentTools(server: McpServer, client: ApiClient): void {
  registerAttach(server, client)
  registerRead(server, client)
  registerDelete(server, client)
  registerReplace(server, client)
}
