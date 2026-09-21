import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { ApiFile } from './client.ts'
import { isTextMime } from './files.ts'

export function jsonResult(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

export function fileResult(uri: string, file: ApiFile): CallToolResult {
  if (isTextMime(file.mimeType)) {
    return { content: [{ type: 'text', text: new TextDecoder().decode(file.bytes) }] }
  }

  return {
    content: [
      {
        type: 'resource',
        resource: {
          uri,
          mimeType: file.mimeType,
          blob: Buffer.from(file.bytes).toString('base64'),
        },
      },
    ],
  }
}
