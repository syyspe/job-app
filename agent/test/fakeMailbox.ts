import type { Mailbox } from '../runner/lib/mailbox.ts'
import type { AlertMessage } from '../runner/lib/sources/types.ts'

export interface FakeMailbox extends Mailbox {
  messages: AlertMessage[]
  // The UIDs messagesAfter was called with.
  reads: number[]
  closed: boolean
}

export function fakeMailbox(messages: AlertMessage[], uidValidity = 1): FakeMailbox {
  const mailbox: FakeMailbox = {
    uidValidity,
    messages,
    reads: [],
    closed: false,
    async *messagesAfter(uid) {
      mailbox.reads.push(uid)
      yield* mailbox.messages.filter((message) => message.uid > uid).toSorted((a, b) => a.uid - b.uid)
    },
    close: () => {
      mailbox.closed = true
      return Promise.resolve()
    },
  }
  return mailbox
}
