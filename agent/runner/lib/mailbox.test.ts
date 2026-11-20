// @vitest-environment node
import { AuthenticationFailure } from 'imapflow'
import { simpleParser } from 'mailparser'
import { expect, test } from 'vitest'
import { connectError, toAlertMessage } from './mailbox.ts'

const eml = [
  'From: "Esimerkki Alerts" <Alerts@Example.COM>',
  'To: me@example.com',
  'Subject: =?UTF-8?Q?Uusia_ty=C3=B6paikkoja?=',
  'Date: Thu, 19 Nov 2026 18:19:06 +0200',
  'MIME-Version: 1.0',
  'Content-Type: multipart/alternative; boundary="b1"',
  '',
  '--b1',
  'Content-Type: text/plain; charset=utf-8',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  'Ty=C3=B6paikka: Kehitt=C3=A4j=C3=A4',
  '--b1',
  'Content-Type: text/html; charset=utf-8',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  '<p>Ty=C3=B6paikka: <a href=3D"https://jobs.example/1">Kehitt=C3=A4j=C3=A4</a></p>',
  '--b1--',
  '',
].join('\r\n')

test('maps a parsed multipart email, decoding quoted-printable UTF-8', async () => {
  const message = toAlertMessage(await simpleParser(eml), 42)

  expect(message).toEqual({
    uid: 42,
    from: 'alerts@example.com',
    subject: 'Uusia työpaikkoja',
    date: '2026-11-19T16:19:06.000Z',
    html: '<p>Työpaikka: <a href="https://jobs.example/1">Kehittäjä</a></p>',
    text: 'Työpaikka: Kehittäjä',
  })
})

test('a plain-text email has an empty html part', async () => {
  const plain = 'From: a@example.com\r\nSubject: Hi\r\nDate: Thu, 19 Nov 2026 18:19:06 +0200\r\n\r\nJust text\r\n'

  expect(toAlertMessage(await simpleParser(plain), 1)).toMatchObject({ html: '', text: 'Just text\n' })
})

const config = { host: 'imap.mail.example', username: 'u', password: 'p', envPath: '/home/u/.config/job-agent/env' }

test('a rejected login is an exit-1 error naming the env file', () => {
  expect(connectError(new AuthenticationFailure('no'), config)).toMatchObject({
    exitCode: 1,
    message: 'mailbox login failed: check MAIL_USERNAME and MAIL_PASSWORD in /home/u/.config/job-agent/env',
  })
})

test('a network failure is an exit-1 error naming the host', () => {
  const refused = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })

  expect(connectError(refused, config)).toMatchObject({ exitCode: 1, message: 'cannot reach mailbox at imap.mail.example' })
})

test('any other error passes through unchanged', () => {
  const bug = new TypeError('oops')

  expect(connectError(bug, config)).toBe(bug)
})
