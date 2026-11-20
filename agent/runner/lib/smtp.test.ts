// @vitest-environment node
import { connect } from 'node:net'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { startFakeSmtp } from '../../test/fakeSmtp.ts'
import type { FakeSmtp } from '../../test/fakeSmtp.ts'
import { sendMail } from './smtp.ts'
import type { MailMessage } from './smtp.ts'

let fake: FakeSmtp

beforeEach(async () => {
  fake = await startFakeSmtp()
})

afterEach(async () => {
  await fake.close()
})

const config = { host: 'smtp.mail.example', username: 'agent@mail.example', password: 'app pass', envPath: '/home/u/env' }

function message(text = 'Two drafts are ready.'): MailMessage {
  return { to: 'me@mail.example', subject: 'job agent: 2 drafts', text, date: new Date('2026-11-20T18:00:00Z') }
}

function send(text?: string, timeoutMs = 2000) {
  return sendMail(message(text), config, { connect: () => connect(fake.port, '127.0.0.1'), timeoutMs })
}

test('a message is sent through the whole exchange with a base64 body', async () => {
  await send()

  await vi.waitFor(() => expect(fake.commands).toContain('QUIT'))
  expect(fake.commands).toEqual([
    expect.stringMatching(/^EHLO /),
    `AUTH PLAIN ${Buffer.from('\0agent@mail.example\0app pass').toString('base64')}`,
    'MAIL FROM:<agent@mail.example>',
    'RCPT TO:<me@mail.example>',
    'DATA',
    'QUIT',
  ])
  expect(fake.received).toHaveLength(1)
  expect(fake.received[0].headers).toEqual({
    From: 'agent@mail.example',
    To: 'me@mail.example',
    Subject: 'job agent: 2 drafts',
    Date: 'Fri, 20 Nov 2026 18:00:00 GMT',
    'MIME-Version': '1.0',
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Transfer-Encoding': 'base64',
  })
  expect(fake.received[0].text).toBe('Two drafts are ready.')
})

test('a body with a lone dot, line breaks and non-ASCII text arrives intact in short lines', async () => {
  const text = `Kehittäjä, Helsinki\r\n.\r\nQUIT\r\n${'x'.repeat(200)}`

  await send(text)

  expect(fake.received[0].text).toBe(text)
  expect(fake.received[0].bodyLines.every((line) => line.length <= 76)).toBe(true)
})

test('a refused login names the env file, not the password', async () => {
  fake.refuse = { verb: 'AUTH', code: 535 }

  await expect(send()).rejects.toMatchObject({
    exitCode: 1,
    message: 'mail login failed: check MAIL_USERNAME and MAIL_PASSWORD in /home/u/env',
  })
  expect(fake.received).toEqual([])
})

test.each([
  ['RCPT', 'RCPT TO', 550],
  ['.', 'message', 554],
])('an unexpected code for %s names the command', async (verb, command, code) => {
  fake.refuse = { verb, code }

  await expect(send()).rejects.toMatchObject({ exitCode: 1, message: `mail server refused ${command} (${code})` })
})

test('a dropped connection is unreachable', async () => {
  fake.dropOn = 'MAIL'

  await expect(send()).rejects.toMatchObject({ exitCode: 1, message: 'cannot reach mail server at smtp.mail.example' })
})

test('a refused connection is unreachable', async () => {
  const port = fake.port
  await fake.close()

  const sending = sendMail(message(), config, { connect: () => connect(port, '127.0.0.1'), timeoutMs: 2000 })

  await expect(sending).rejects.toMatchObject({ exitCode: 1, message: 'cannot reach mail server at smtp.mail.example' })
})

test('a server that never answers times out as unreachable', async () => {
  fake.silent = true

  await expect(send(undefined, 100)).rejects.toMatchObject({
    exitCode: 1,
    message: 'cannot reach mail server at smtp.mail.example',
  })
})
