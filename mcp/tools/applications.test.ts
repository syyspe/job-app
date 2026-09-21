// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { callTool, jsonOf, startHarness, textOf } from '../test/harness.ts'
import type { Harness } from '../test/harness.ts'
import type { Application } from '../../server/types.ts'

let harness: Harness

beforeEach(async () => {
  harness = await startHarness()
})

afterEach(async () => {
  await harness.close()
})

function call(name: string, args: Record<string, unknown> = {}) {
  return callTool(harness.client, name, args)
}

async function createApplication(
  args: Record<string, unknown> = {},
): Promise<Application> {
  const result = await call('create_application', {
    company: 'Acme',
    role: 'Engineer',
    dateApplied: '2026-01-15',
    status: 'applied',
    ...args,
  })
  return jsonOf<Application>(result)
}

test('create_application returns the new application and it shows up in the list', async () => {
  const created = await createApplication({ notes: 'via mcp' })

  expect(created.id).toBeGreaterThan(0)
  expect(created.company).toBe('Acme')
  expect(created.notes).toBe('via mcp')

  const listed = jsonOf<Application[]>(await call('list_applications'))
  expect(listed.map((application) => application.id)).toEqual([created.id])
})

test('a non-draft create with no dateApplied is a tool error and creates nothing', async () => {
  const result = await call('create_application', {
    company: 'Acme',
    role: 'Engineer',
    status: 'applied',
  })

  expect(result.isError).toBe(true)
  expect(textOf(result)).toContain('dateApplied')

  expect(jsonOf<Application[]>(await call('list_applications'))).toEqual([])
})

test('a draft with no dateApplied is fine', async () => {
  const draft = await createApplication({ status: 'draft', dateApplied: '' })

  expect(draft.status).toBe('draft')
})

test('archived applications are hidden unless asked for', async () => {
  const created = await createApplication()
  await call('archive_application', { id: created.id, archived: true })

  expect(jsonOf<Application[]>(await call('list_applications'))).toEqual([])

  const all = jsonOf<Application[]>(await call('list_applications', { includeArchived: true }))
  expect(all.map((application) => application.id)).toEqual([created.id])
})

test('get_application returns the application with its attachments', async () => {
  const created = await createApplication()

  const fetched = jsonOf<Application>(await call('get_application', { id: created.id }))
  expect(fetched.company).toBe('Acme')
  expect(fetched.attachments).toEqual([])
})

test('get_application on an unknown id names the id', async () => {
  const result = await call('get_application', { id: 9999 })

  expect(result.isError).toBe(true)
  expect(textOf(result)).toContain('no application with id 9999')
})

test('update_application changes only the fields given', async () => {
  const created = await createApplication({
    deadline: '2026-02-01',
    link: 'https://example.test/job',
    notes: 'referred by a friend',
  })

  const updated = jsonOf<Application>(
    await call('update_application', {
      id: created.id,
      status: 'interview',
      notes: 'phone screen booked',
    }),
  )

  expect(updated.status).toBe('interview')
  expect(updated.notes).toBe('phone screen booked')
  expect(updated.company).toBe(created.company)
  expect(updated.role).toBe(created.role)
  expect(updated.dateApplied).toBe(created.dateApplied)
  expect(updated.deadline).toBe('2026-02-01')
  expect(updated.link).toBe('https://example.test/job')
})

test('a dateless draft can be moved to applied with a dateApplied in the same call', async () => {
  const draft = await createApplication({ status: 'draft', dateApplied: '' })

  const updated = jsonOf<Application>(
    await call('update_application', {
      id: draft.id,
      status: 'applied',
      dateApplied: '2026-03-02',
    }),
  )

  expect(updated.status).toBe('applied')
  expect(updated.dateApplied).toBe('2026-03-02')
})

test('moving a dateless draft onwards is a tool error, not a bare 400', async () => {
  const draft = await createApplication({ status: 'draft', dateApplied: '' })

  const result = await call('update_application', { id: draft.id, status: 'applied' })

  expect(result.isError).toBe(true)
  expect(textOf(result)).toContain('dateApplied')

  const unchanged = jsonOf<Application>(await call('get_application', { id: draft.id }))
  expect(unchanged.status).toBe('draft')
})

test('an empty string clears an optional field', async () => {
  const created = await createApplication({ link: 'https://example.test/job' })

  const updated = jsonOf<Application>(
    await call('update_application', { id: created.id, link: '' }),
  )

  expect(updated.link).toBe('')
})

test('update_application on an unknown id names the id', async () => {
  const result = await call('update_application', { id: 9999, status: 'offer' })

  expect(result.isError).toBe(true)
  expect(textOf(result)).toContain('no application with id 9999')
})

test('archive_application round-trips', async () => {
  const created = await createApplication()

  const archived = jsonOf<Application>(
    await call('archive_application', { id: created.id, archived: true }),
  )
  expect(archived.archived).toBe(true)

  const restored = jsonOf<Application>(
    await call('archive_application', { id: created.id, archived: false }),
  )
  expect(restored.archived).toBe(false)
})

test('archive_application on an unknown id names the id', async () => {
  const result = await call('archive_application', { id: 9999, archived: true })

  expect(result.isError).toBe(true)
  expect(textOf(result)).toContain('no application with id 9999')
})
