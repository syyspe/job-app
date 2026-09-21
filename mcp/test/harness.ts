import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { openDatabase } from '../../server/db/index.ts'
import { createApp } from '../../server/app.ts'
import { createUser } from '../../server/lib/seed.ts'
import { createApiClient } from '../lib/client.ts'
import { createMcpServer } from '../server.ts'

export interface Harness {
  client: Client
  root: string
  uploadsDir: string
  close: () => Promise<void>
}

async function listen(httpServer: Server): Promise<string> {
  await new Promise<void>((resolve) => httpServer.once('listening', resolve))
  const address = httpServer.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return `http://localhost:${port}`
}

export async function startHarness(): Promise<Harness> {
  const root = mkdtempSync(join(tmpdir(), 'job-app-mcp-'))
  const uploadsDir = join(root, 'uploads')
  const db = openDatabase(join(root, 'app.db'))
  createUser(db, 'testuser', 'test-password')
  const httpServer = createApp(db, uploadsDir).listen(0)
  const baseUrl = await listen(httpServer)

  const server = createMcpServer(
    createApiClient({ baseUrl, username: 'testuser', password: 'test-password' }),
  )
  const client = new Client({ name: 'harness', version: '0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)

  return {
    client,
    root,
    uploadsDir,
    close: async () => {
      await client.close()
      await server.close()
      await new Promise<void>((resolve) => httpServer.close(() => resolve()))
      rmSync(root, { recursive: true, force: true })
    },
  }
}

export function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  return client.callTool({ name, arguments: args }) as Promise<CallToolResult>
}

export function textOf(result: CallToolResult): string {
  const [first] = result.content
  if (first.type !== 'text') throw new Error(`expected text content, got ${first.type}`)
  return first.text
}

export function jsonOf<T>(result: CallToolResult): T {
  return JSON.parse(textOf(result)) as T
}
