// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { callTool, jsonOf, startHarness, textOf } from '../test/harness.ts'
import type { Harness } from '../test/harness.ts'
import type { Application, Attachment } from '../../server/types.ts'

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

async function createApplication(): Promise<Application> {
  return jsonOf<Application>(
    await call('create_application', {
      company: 'Acme',
      role: 'Engineer',
      dateApplied: '2026-01-15',
    }),
  )
}

function writeLocalFile(name: string, contents: string | Uint8Array): string {
  const path = join(harness.root, name)
  writeFileSync(path, contents)
  return path
}

async function attach(name: string, contents: string | Uint8Array): Promise<Attachment> {
  const application = await createApplication()
  const result = await call('attach_file', {
    applicationId: application.id,
    path: writeLocalFile(name, contents),
  })
  return jsonOf<Attachment>(result)
}

test('attach_file uploads the file under its own name and type', async () => {
  const attached = await attach('cover-letter.txt', 'Dear Acme,\n')

  expect(attached.originalName).toBe('cover-letter.txt')
  expect(attached.mimeType).toBe('text/plain')

  const application = jsonOf<Application>(
    await call('get_application', { id: attached.applicationId }),
  )
  expect(application.attachments.map((one) => one.id)).toEqual([attached.id])
})

test('attach_file guesses a pdf from its extension', async () => {
  const attached = await attach('cv.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46]))

  expect(attached.mimeType).toBe('application/pdf')
})

test('attach_file on a missing path names the path', async () => {
  const application = await createApplication()
  const missing = join(harness.root, 'nope.pdf')

  const result = await call('attach_file', { applicationId: application.id, path: missing })

  expect(result.isError).toBe(true)
  expect(textOf(result)).toContain(`no file at ${missing}`)
})

test('attach_file on an unknown application names the id', async () => {
  const result = await call('attach_file', {
    applicationId: 9999,
    path: writeLocalFile('cv.pdf', 'x'),
  })

  expect(result.isError).toBe(true)
  expect(textOf(result)).toContain('no application with id 9999')
})

test('read_attachment returns a text file as text', async () => {
  const attached = await attach('cover-letter.txt', 'Dear Acme,\n')

  const result = await call('read_attachment', { id: attached.id })

  expect(result.isError).toBeFalsy()
  expect(textOf(result)).toBe('Dear Acme,\n')
})

test('read_attachment returns a pdf as an embedded resource', async () => {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46])
  const attached = await attach('cv.pdf', bytes)

  const result = await call('read_attachment', { id: attached.id })

  expect(result.content[0]).toEqual({
    type: 'resource',
    resource: {
      uri: `jobapp://attachments/${attached.id}`,
      mimeType: 'application/pdf',
      blob: Buffer.from(bytes).toString('base64'),
    },
  })
})

test('read_attachment on an unknown id names the id', async () => {
  const result = await call('read_attachment', { id: 9999 })

  expect(result.isError).toBe(true)
  expect(textOf(result)).toContain('no attachment with id 9999')
})
