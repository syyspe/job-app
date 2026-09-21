import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
}

const TEXT_MIME_TYPES = ['application/json', 'application/xml']

export interface LocalFile {
  bytes: Uint8Array
  mimeType: string
}

export async function readLocalFile(path: string): Promise<LocalFile> {
  const bytes = await readFile(path).catch(() => {
    throw new Error(`no file at ${path}`)
  })
  return {
    bytes,
    mimeType: MIME_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream',
  }
}

export function isTextMime(mimeType: string): boolean {
  const type = mimeType.split(';')[0].trim()
  return type.startsWith('text/') || TEXT_MIME_TYPES.includes(type)
}
