import { AuthenticationFailure, ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import type { ParsedMail } from 'mailparser'
import { CliError } from '../../lib/cliError.ts'
import type { MailEnv } from './env.ts'
import type { AlertMessage } from './sources/types.ts'

// The env file the credentials came from, named when a login is rejected.
export interface MailConfig extends MailEnv {
  envPath: string
}

export interface Mailbox {
  uidValidity: number
  // INBOX messages with a UID above `uid`, in UID order.
  messagesAfter: (uid: number) => AsyncIterable<AlertMessage>
  close: () => Promise<void>
}

export function toAlertMessage(parsed: ParsedMail, uid: number): AlertMessage {
  return {
    uid,
    from: (parsed.from?.value[0]?.address ?? '').toLowerCase(),
    subject: parsed.subject ?? '',
    date: (parsed.date ?? new Date(0)).toISOString(),
    html: parsed.html || '',
    text: parsed.text ?? '',
  }
}

// Socket and DNS failures carry Node's code, ImapFlow's own carry theirs.
export function connectError(err: unknown, config: MailConfig): unknown {
  if (err instanceof AuthenticationFailure) {
    return new CliError(1, `mailbox login failed: check MAIL_USERNAME and MAIL_PASSWORD in ${config.envPath}`, { cause: err })
  }
  if (typeof (err as { code?: unknown }).code !== 'string') return err
  return new CliError(1, `cannot reach mailbox at ${config.host}`, { cause: err })
}

// Read-only: nothing is flagged, moved or deleted on the server.
export async function openMailbox(config: MailConfig): Promise<Mailbox> {
  const client = new ImapFlow({
    host: config.host,
    port: 993,
    secure: true,
    auth: { user: config.username, pass: config.password },
    // Runner commands print only their results.
    logger: false,
  })
  // A connection error also rejects the pending command, which reports it.
  client.on('error', () => undefined)
  let opened
  try {
    await client.connect()
    opened = await client.mailboxOpen('INBOX', { readOnly: true })
  } catch (err) {
    throw connectError(err, config)
  }
  const { uidValidity, uidNext } = opened
  async function* messagesAfter(uid: number): AsyncIterable<AlertMessage> {
    if (uid + 1 >= uidNext) return
    const fetched = await client.fetchAll(`${uid + 1}:*`, { uid: true, source: true }, { uid: true })
    const fresh = fetched.filter((message) => message.uid > uid).toSorted((a, b) => a.uid - b.uid)
    for (const message of fresh) {
      if (message.source) yield toAlertMessage(await simpleParser(message.source), message.uid)
    }
  }
  return { uidValidity: Number(uidValidity), messagesAfter, close: () => client.logout() }
}
