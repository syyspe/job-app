import { isIP } from 'node:net'
import { hostname } from 'node:os'
import type { Duplex } from 'node:stream'
import { connect as tlsConnect } from 'node:tls'
import { CliError } from '../../lib/cliError.ts'

export interface MailMessage {
  to: string
  subject: string
  text: string
  date: Date
}

// The login doubles as the From address. envPath is named when it is rejected.
export interface SmtpConfig {
  host: string
  username: string
  password: string
  envPath: string
}

export interface SmtpTransport {
  connect: (host: string) => Duplex
  timeoutMs: number
}

// Implicit TLS, the only mode the runner speaks. SNI takes a hostname, never an IP.
const SMTPS: SmtpTransport = {
  connect: (host) => tlsConnect({ host, port: 465, servername: isIP(host) ? undefined : host }),
  timeoutMs: 30000,
}

interface Reply {
  code: number
}

interface Session {
  send: (line: string) => void
  // Fails with CliError when the connection drops, errors or times out.
  read: () => Promise<Reply>
}

// A reply ends at its first line with a space, or nothing, after the code;
// continuation lines carry a '-' there.
function takeReply(buffer: string): { reply: Reply; rest: string } | undefined {
  const lines = buffer.split('\r\n')
  const last = lines.slice(0, -1).findIndex((line) => line.length === 3 || line[3] === ' ')
  if (last === -1) return undefined
  return { reply: { code: Number(lines[last].slice(0, 3)) }, rest: lines.slice(last + 1).join('\r\n') }
}

function openSession(socket: Duplex, host: string): Session {
  let buffer = ''
  let failure: Error | undefined
  let wake = () => {}
  socket.setEncoding('utf8')
  socket.on('data', (chunk: string) => {
    buffer += chunk
    wake()
  })
  socket.on('error', (err) => {
    failure = err
    wake()
  })
  socket.on('close', () => {
    failure ??= new Error('connection closed')
    wake()
  })
  async function read(): Promise<Reply> {
    for (;;) {
      const taken = takeReply(buffer)
      if (taken) {
        buffer = taken.rest
        return taken.reply
      }
      if (failure) throw new CliError(1, `cannot reach mail server at ${host}`, { cause: failure })
      await new Promise<void>((resolve) => (wake = resolve))
    }
  }
  return { send: (line) => socket.write(`${line}\r\n`), read }
}

// Base64 in 76-character lines: no line can start with '.', and no header or
// line break in ad text can reach the protocol.
function formatMessage(message: MailMessage, from: string): string {
  const body = Buffer.from(message.text, 'utf8').toString('base64').match(/.{1,76}/g) ?? []
  return [
    `From: ${from}`,
    `To: ${message.to}`,
    `Subject: ${message.subject}`,
    `Date: ${message.date.toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    ...body,
    '.',
  ].join('\r\n')
}

interface Step {
  command: string
  line: string
  expect: number
}

function steps(message: MailMessage, config: SmtpConfig): Step[] {
  const auth = Buffer.from(`\0${config.username}\0${config.password}`, 'utf8').toString('base64')
  return [
    { command: 'EHLO', line: `EHLO ${hostname()}`, expect: 250 },
    { command: 'AUTH', line: `AUTH PLAIN ${auth}`, expect: 235 },
    { command: 'MAIL FROM', line: `MAIL FROM:<${config.username}>`, expect: 250 },
    { command: 'RCPT TO', line: `RCPT TO:<${message.to}>`, expect: 250 },
    { command: 'DATA', line: 'DATA', expect: 354 },
    { command: 'message', line: formatMessage(message, config.username), expect: 250 },
  ]
}

function refusal(step: Step, code: number, envPath: string): CliError {
  if (code === 535) return new CliError(1, `mail login failed: check MAIL_USERNAME and MAIL_PASSWORD in ${envPath}`)
  return new CliError(1, `mail server refused ${step.command} (${code})`)
}

async function converse(session: Session, message: MailMessage, config: SmtpConfig): Promise<void> {
  const greeting = await session.read()
  if (greeting.code !== 220) throw new CliError(1, `mail server refused the connection (${greeting.code})`)
  for (const step of steps(message, config)) {
    session.send(step.line)
    const { code } = await session.read()
    if (code !== step.expect) throw refusal(step, code, config.envPath)
  }
  session.send('QUIT')
}

// Resolves once the server has accepted the message (250 after the final
// '.'); the QUIT that follows is not waited on.
export async function sendMail(message: MailMessage, config: SmtpConfig, transport = SMTPS): Promise<void> {
  const socket = transport.connect(config.host)
  const timer = setTimeout(() => socket.destroy(new Error('timed out')), transport.timeoutMs)
  try {
    await converse(openSession(socket, config.host), message, config)
  } finally {
    clearTimeout(timer)
    socket.end()
  }
}
