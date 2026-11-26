// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { makeTempDir } from '../../test/tempDir.ts'
import type { TempDir } from '../../test/tempDir.ts'
import { loadApiKey, loadJobAppEnv, loadMailEnv, loadSmtpEnv } from './env.ts'

let dir: TempDir

beforeEach(() => {
  dir = makeTempDir()
})

afterEach(() => {
  dir.remove()
})

const complete = 'JOBAPP_API_URL=http://localhost:3001\nJOBAPP_USERNAME=runner\nJOBAPP_PASSWORD="se cret"\n'

test('reads the three job-app variables without touching process.env', () => {
  const path = dir.write('env', `# runner\n${complete}`)

  expect(loadJobAppEnv(path)).toEqual({
    baseUrl: 'http://localhost:3001',
    username: 'runner',
    password: 'se cret',
  })
  expect(process.env.JOBAPP_USERNAME).toBeUndefined()
})

test('a missing file is an exit-2 error naming it', () => {
  const path = `${dir.root}/env`

  expect(() => loadJobAppEnv(path)).toThrow(
    expect.objectContaining({ exitCode: 2, message: `${path}: file not found` }),
  )
})

test('a missing variable is an exit-2 error naming it', () => {
  const path = dir.write('env', complete.replace(/JOBAPP_PASSWORD=.*\n/, ''))

  expect(() => loadJobAppEnv(path)).toThrow(
    expect.objectContaining({ exitCode: 2, message: `${path}: JOBAPP_PASSWORD is not set` }),
  )
})

const mail = 'MAIL_IMAP_HOST=imap.mail.example\nMAIL_USERNAME=alerts@mail.example\nMAIL_PASSWORD="app pass"\n'

test('reads the three mail variables from the same file', () => {
  const path = dir.write('env', `${complete}${mail}`)

  expect(loadMailEnv(path)).toEqual({ host: 'imap.mail.example', username: 'alerts@mail.example', password: 'app pass' })
  expect(process.env.MAIL_PASSWORD).toBeUndefined()
})

test('a missing mail variable is an exit-2 error naming it', () => {
  const path = dir.write('env', mail.replace(/MAIL_IMAP_HOST=.*\n/, ''))

  expect(() => loadMailEnv(path)).toThrow(
    expect.objectContaining({ exitCode: 2, message: `${path}: MAIL_IMAP_HOST is not set` }),
  )
})

test('reads the SMTP host with the shared mail login', () => {
  const path = dir.write('env', `${mail}MAIL_SMTP_HOST=smtp.mail.example\n`)

  expect(loadSmtpEnv(path)).toEqual({ host: 'smtp.mail.example', username: 'alerts@mail.example', password: 'app pass' })
})

test('a missing SMTP host is an exit-2 error naming it', () => {
  const path = dir.write('env', mail)

  expect(() => loadSmtpEnv(path)).toThrow(
    expect.objectContaining({ exitCode: 2, message: `${path}: MAIL_SMTP_HOST is not set` }),
  )
})

test('reads the API key without touching process.env', () => {
  const path = dir.write('env', `${complete}ANTHROPIC_API_KEY=sk-test\n`)

  expect(loadApiKey(path)).toBe('sk-test')
  expect(process.env.ANTHROPIC_API_KEY).toBeUndefined()
})

test('a missing API key is an exit-2 error naming it', () => {
  const path = dir.write('env', complete)

  expect(() => loadApiKey(path)).toThrow(
    expect.objectContaining({ exitCode: 2, message: `${path}: ANTHROPIC_API_KEY is not set` }),
  )
})
