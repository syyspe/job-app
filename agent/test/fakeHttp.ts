import type { IncomingMessage, ServerResponse } from 'node:http'

export async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const parts: Buffer[] = []
  for await (const part of req) parts.push(part as Buffer)
  return JSON.parse(Buffer.concat(parts).toString('utf8')) as Record<string, unknown>
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
}
