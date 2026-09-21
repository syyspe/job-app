import { z } from 'zod'
import { basename } from 'node:path'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Attachment } from '../../server/types.ts'
import { fetchApplication } from '../lib/applications.ts'
import { ApiError } from '../lib/client.ts'
import type { ApiClient, ApiFile } from '../lib/client.ts'
import { readLocalFile } from '../lib/files.ts'
import { fileResult, jsonResult } from '../lib/results.ts'

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
      const file = await readLocalFile(path)
      const form = new FormData()
      form.append('file', new File([file.bytes], basename(path), { type: file.mimeType }))
      return jsonResult(
        await client.sendForm<Attachment>(
          `/api/applications/${applicationId}/attachments`,
          form,
        ),
      )
    },
  )
}

async function downloadAttachment(client: ApiClient, id: number): Promise<ApiFile> {
  try {
    return await client.getFile(`/api/attachments/${id}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new Error(`no attachment with id ${id}`)
    }
    throw error
  }
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
      const file = await downloadAttachment(client, id)
      return fileResult(`jobapp://attachments/${id}`, file)
    },
  )
}

export function registerAttachmentTools(server: McpServer, client: ApiClient): void {
  registerAttach(server, client)
  registerRead(server, client)
}
