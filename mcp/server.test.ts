// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { startHarness } from './test/harness.ts'
import type { Harness } from './test/harness.ts'

let harness: Harness

beforeEach(async () => {
  harness = await startHarness()
})

afterEach(async () => {
  await harness.close()
})

test('the server offers exactly the seven job-application tools', async () => {
  const { tools } = await harness.client.listTools()

  expect(tools.map((tool) => tool.name).sort()).toEqual([
    'archive_application',
    'attach_file',
    'create_application',
    'get_application',
    'list_applications',
    'read_attachment',
    'update_application',
  ])
})
