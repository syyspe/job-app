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

test('the server offers exactly the fifteen job-application tools', async () => {
  const { tools } = await harness.client.listTools()

  expect(tools.map((tool) => tool.name).sort()).toEqual([
    'answer_questions',
    'archive_application',
    'attach_file',
    'create_application',
    'delete_attachment',
    'dismiss_ad',
    'get_ad',
    'get_application',
    'handover_ad',
    'list_ads',
    'list_applications',
    'list_open_questions',
    'read_attachment',
    'replace_attachment',
    'update_application',
  ])
})
