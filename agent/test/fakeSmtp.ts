import { createServer } from 'node:net'
import type { Socket } from 'node:net'

export interface ReceivedMail {
  headers: Record<string, string>
  // The base64 body, decoded.
  text: string
  // The body exactly as sent, line by line.
  bodyLines: string[]
}

export interface FakeSmtp {
  port: number
  // Every command line received, AUTH included, in order.
  commands: string[]
  received: ReceivedMail[]
  // Answer the command with this verb ('EHLO', 'AUTH', 'MAIL', 'RCPT', 'DATA',
  // or '.' for the end of the message) with `code` instead of success.
  refuse: { verb: string; code: number } | null
  // Close the connection instead of answering the command with this verb.
  dropOn: string | null
  // Never send the greeting, so the client times out.
  silent: boolean
  close: () => Promise<void>
}

const SUCCESS: Record<string, string> = {
  EHLO: '250-fake.example\r\n250 AUTH PLAIN\r\n',
  AUTH: '235 ok\r\n',
  MAIL: '250 ok\r\n',
  RCPT: '250 ok\r\n',
  DATA: '354 go ahead\r\n',
  '.': '250 queued\r\n',
  QUIT: '221 bye\r\n',
}

function decodeMail(lines: string[]): ReceivedMail {
  const blank = lines.indexOf('')
  const headers: Record<string, string> = {}
  for (const line of lines.slice(0, blank)) {
    const colon = line.indexOf(':')
    headers[line.slice(0, colon)] = line.slice(colon + 1).trim()
  }
  const bodyLines = lines.slice(blank + 1)
  return { headers, text: Buffer.from(bodyLines.join(''), 'base64').toString('utf8'), bodyLines }
}

function answer(fake: FakeSmtp, socket: Socket, verb: string): void {
  if (fake.dropOn === verb) return void socket.destroy()
  if (fake.refuse?.verb === verb) return void socket.write(`${fake.refuse.code} refused\r\n`)
  socket.write(SUCCESS[verb] ?? '500 unknown\r\n')
  if (verb === 'QUIT') socket.end()
}

interface Conversation {
  fake: FakeSmtp
  socket: Socket
  // The message lines so far, between an accepted DATA and the lone '.'.
  message: string[] | null
}

function receiveCommand(conversation: Conversation, line: string): void {
  const { fake, socket } = conversation
  fake.commands.push(line)
  const verb = line.split(' ')[0].toUpperCase()
  const accepted = fake.refuse?.verb !== verb && fake.dropOn !== verb
  if (verb === 'DATA' && accepted) conversation.message = []
  answer(fake, socket, verb)
}

function receiveLine(conversation: Conversation, line: string): void {
  const { message } = conversation
  if (!message) return receiveCommand(conversation, line)
  if (line !== '.') return void message.push(line)
  conversation.fake.received.push(decodeMail(message))
  conversation.message = null
  answer(conversation.fake, conversation.socket, '.')
}

// One conversation per connection: commands until DATA, then message lines
// until the lone '.'.
function converse(fake: FakeSmtp, socket: Socket): void {
  const conversation: Conversation = { fake, socket, message: null }
  let buffer = ''
  socket.setEncoding('utf8')
  socket.on('data', (chunk: string) => {
    buffer += chunk
    const lines = buffer.split('\r\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) receiveLine(conversation, line)
  })
  socket.on('error', () => {})
  if (!fake.silent) socket.write('220 fake.example ESMTP\r\n')
}

// A plain-TCP stand-in for the mail server; tests connect with net.connect.
export async function startFakeSmtp(): Promise<FakeSmtp> {
  const sockets = new Set<Socket>()
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    converse(fake, socket)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const fake: FakeSmtp = {
    port: typeof address === 'object' && address ? address.port : 0,
    commands: [],
    received: [],
    refuse: null,
    dropOn: null,
    silent: false,
    close: () => {
      for (const socket of sockets) socket.destroy()
      return new Promise((resolve) => server.close(() => resolve()))
    },
  }
  return fake
}
