// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { callTool, jsonOf, startHarness, textOf } from '../test/harness.ts'
import type { Harness } from '../test/harness.ts'
import type { Application, Attachment, OpenQuestion } from '../../server/types.ts'

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

async function draftWithQuestions(): Promise<Application> {
  const application = jsonOf<Application>(
    await call('create_application', {
      company: 'Acme',
      role: 'Engineer',
      status: 'draft',
      notes: 'Open questions:\nq1: Why Acme?\nq2: When?',
    }),
  )
  const path = join(harness.root, 'Letter.md')
  writeFileSync(path, 'Because [[ASK:q1]]. From [[ASK:q2]].')
  await call('attach_file', { applicationId: application.id, path })
  return application
}

test('list_open_questions lists the markers with their texts', async () => {
  const application = await draftWithQuestions()

  const result = await call('list_open_questions', { applicationId: application.id })

  expect(jsonOf<OpenQuestion[]>(result)).toEqual([
    { id: 'q1', text: 'Why Acme?' },
    { id: 'q2', text: 'When?' },
  ])
})

test('answer_questions fills the answered marker and returns what is still open', async () => {
  const application = await draftWithQuestions()

  const result = await call('answer_questions', {
    applicationId: application.id,
    answers: { q1: 'the product', q2: '' },
  })

  expect(jsonOf<OpenQuestion[]>(result)).toEqual([{ id: 'q2', text: 'When?' }])
  const updated = jsonOf<Application>(await call('get_application', { id: application.id }))
  const copy = updated.attachments.find((one: Attachment) => one.editedFromId !== null)
  expect(copy?.originalName).toBe('Letter (edited).md')
  expect(textOf(await call('read_attachment', { id: copy?.id }))).toBe('Because the product. From [[ASK:q2]].')
  expect(updated.notes).toBe('Open questions:\nq1: Why Acme?\n→ the product\nq2: When?')
})

test('an unknown application is named in the error', async () => {
  for (const [name, args] of [
    ['list_open_questions', { applicationId: 9999 }],
    ['answer_questions', { applicationId: 9999, answers: { q1: 'x' } }],
  ] as const) {
    const result = await call(name, args)
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('no application with id 9999')
  }
})

test('answering a question that is not open is a tool error with the server message', async () => {
  const application = await draftWithQuestions()

  const result = await call('answer_questions', { applicationId: application.id, answers: { q7: 'x' } })

  expect(result.isError).toBe(true)
  expect(textOf(result)).toContain('q7 is not an open question')
})
