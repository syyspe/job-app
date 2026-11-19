// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { CliError } from '../lib/cliError.ts'
import type { SearchRequest, SearchResult } from './lib/search.ts'
import { createProfileServer } from './server.ts'

let client: Client
let requests: SearchRequest[]
let answer: () => Promise<SearchResult[]>

const result: SearchResult = { source: 'cv.md', label: 'facts', text: 'Led a migration.', score: 0.9 }

beforeEach(async () => {
  requests = []
  answer = async () => [result]
  const server = createProfileServer((request) => {
    requests.push(request)
    return answer()
  })
  client = new Client({ name: 'test', version: '0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
})

afterEach(async () => {
  await client.close()
})

function call(args: Record<string, unknown>): Promise<CallToolResult> {
  return client.callTool({ name: 'search_profile', arguments: args }) as Promise<CallToolResult>
}

function textOf(response: CallToolResult): string {
  const [first] = response.content
  if (first.type !== 'text') throw new Error(`expected text content, got ${first.type}`)
  return first.text
}

test('the server offers exactly search_profile', async () => {
  const { tools } = await client.listTools()

  expect(tools.map((tool) => tool.name)).toEqual(['search_profile'])
})

test('a call returns the results, with limit defaulting to 5', async () => {
  const response = await call({ query: 'migration' })

  expect(JSON.parse(textOf(response))).toEqual([result])
  expect(requests).toEqual([{ query: 'migration', limit: 5 }])
})

test('an unknown label is rejected before searching', async () => {
  const response = await call({ query: 'migration', label: 'other' })

  expect(response.isError).toBe(true)
  expect(requests).toEqual([])
})

test('a search refusal comes back as a tool error', async () => {
  answer = () => Promise.reject(new CliError(1, 'the profile index has no completed build: run npm run profile:index'))

  const response = await call({ query: 'migration' })

  expect(response.isError).toBe(true)
  expect(textOf(response)).toContain('run npm run profile:index')
})
