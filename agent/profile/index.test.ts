// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import {
  buildFixtureIndex,
  closeProfileFixture,
  runNode,
  startProfileFixture,
  writeConfig,
} from '../test/profileFixture.ts'
import type { ProfileFixture } from '../test/profileFixture.ts'

const entry = join(import.meta.dirname, 'index.ts')
let fixture: ProfileFixture

beforeEach(async () => {
  fixture = await startProfileFixture()
})

afterEach(async () => {
  await closeProfileFixture(fixture)
})

async function callSearch(args: Record<string, unknown>): Promise<CallToolResult> {
  const client = new Client({ name: 'test', version: '0' })
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry], env: fixture.env }))
  try {
    return (await client.callTool({ name: 'search_profile', arguments: args })) as CallToolResult
  } finally {
    await client.close()
  }
}

function textOf(response: CallToolResult): string {
  const [first] = response.content
  if (first.type !== 'text') throw new Error(`expected text content, got ${first.type}`)
  return first.text
}

test('the spawned entry searches the built index', async () => {
  await buildFixtureIndex(fixture)

  const response = await callSearch({ query: 'billing migration', label: 'facts' })

  expect(JSON.parse(textOf(response))).toEqual([
    expect.objectContaining({ source: 'cv.md', label: 'facts' }),
  ])
})

test('a missing index is a tool error telling the user to build it', async () => {
  const response = await callSearch({ query: 'billing' })

  expect(response.isError).toBe(true)
  expect(textOf(response)).toContain('run npm run profile:index')
})

test('a config error exits 2 with one line, no stack and nothing on stdout', async () => {
  writeConfig(fixture, { ...fixture.config, ollamaUrl: 'ftp://laptop' })

  const result = await runNode(entry, [], fixture.env)

  expect(result.status).toBe(2)
  expect(result.stderr).toMatch(/^[^\n]*config\.json: ollamaUrl: [^\n]*\n$/)
  expect(result.stdout).toBe('')
})
