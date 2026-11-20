// The source connector contract: docs/job-search-agent.md §6.

export type SourceMode = 'automatic' | 'handover'

// One alert email, as the mailbox hands it to the connectors.
export interface AlertMessage {
  uid: number
  // The sender's address, lowercased.
  from: string
  subject: string
  // ISO 8601.
  date: string
  html: string
  text: string
}

export interface AdCandidate {
  externalId: string
  url: string
  title: string
  company?: string
  location?: string
  // YYYY-MM-DD.
  deadline?: string
}

export type FetchResult =
  | { kind: 'ok'; text: string; company?: string; deadline?: string }
  | { kind: 'gone' }
  | { kind: 'blocked' }
  | { kind: 'failed'; category: string }

export type PageResult =
  | { kind: 'page'; html: string }
  | { kind: 'gone' }
  | { kind: 'blocked' }
  | { kind: 'failed'; category: string }

// The only way a connector reaches the network; see politeHttp.ts.
export interface PoliteHttp {
  get(url: string): Promise<PageResult>
  readonly dayEnded: boolean
}

export interface SourceConnector {
  id: string
  mode: SourceMode
  matches(message: AlertMessage): boolean
  parseAlert(message: AlertMessage): AdCandidate[]
  fetchHosts?: string[]
  fetchAd?(candidate: AdCandidate, http: PoliteHttp): Promise<FetchResult>
}
