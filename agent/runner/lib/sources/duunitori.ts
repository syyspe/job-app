// Duunitori (duunitori.fi), hand-over: its ads are never fetched.
//
// Alerts ("Duunivahti") come from duunivahti@duunitori.fi with subjects like
// "Duunitori löysi sinulle 13 työpaikkaa - …". The matched ads come first,
// then a "Näitkö jo nämä?" block of recommendations the alert did not match,
// which is ignored. Each ad is an <a class="dark-white"> holding the title,
// linking straight to https://duunitori.fi/tyopaikat/tyo/<slug>-<id> plus
// utm parameters, followed by a `dark-gray` cell reading
// "Company, City - Hakuaika D.M - D.M." or "Company - Toistaiseksi voimassa".
// The trailing number of the slug is the external id. The closing date has
// no year: it is the next such date on or after the alert's own date.
import { isoDate, linkOn, pageUrl } from './common.ts'
import { decodeEntities, htmlToText } from './html.ts'
import type { AdCandidate, AlertMessage, SourceConnector } from './types.ts'

const HOSTS = ['duunitori.fi']
const AD_PATH = /^\/tyopaikat\/tyo\/[^/]+-(\d+)$/
const RECOMMENDATIONS = 'Näitkö jo nämä?'

interface Facts {
  company?: string
  location?: string
  closes?: { day: string; month: string }
}

// "Esimerkki Oy, Tampere - Hakuaika 18.11 - 2.12." → company, location, closes.
function factsOf(line: string): Facts {
  const [head] = line.split(/ - (?:Hakuaika|Toistaiseksi)/)
  const comma = head.lastIndexOf(', ')
  const company = (comma < 0 ? head : head.slice(0, comma)).trim()
  const location = comma < 0 ? '' : head.slice(comma + 2).trim()
  const closes = /Hakuaika .* - (\d{1,2})\.(\d{1,2})\.?$/.exec(line)
  return {
    ...(company && { company }),
    ...(location && { location }),
    ...(closes && { closes: { day: closes[1], month: closes[2] } }),
  }
}

function deadlineAfter(closes: Facts['closes'], sent: string): string | undefined {
  if (!closes) return undefined
  const year = Number(sent.slice(0, 4))
  const date = isoDate(closes.day, closes.month, String(year))
  return date >= sent.slice(0, 10) ? date : isoDate(closes.day, closes.month, String(year + 1))
}

// The card's own link and title, or null unless it is an ad on duunitori.fi.
function adLinkOf(card: string): { externalId: string; url: string; title: string } | null {
  const [, href = '', inner = ''] = /^<a class="dark-white" href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/.exec(card) ?? []
  const url = linkOn(decodeEntities(href), HOSTS)
  const externalId = url && AD_PATH.exec(url.pathname)?.[1]
  const title = htmlToText(inner)
  return url && externalId && title ? { externalId, url: pageUrl(url), title } : null
}

function candidateOf(card: string, sent: string): AdCandidate | null {
  const link = adLinkOf(card)
  if (!link) return null
  const { closes, ...facts } = factsOf(htmlToText(/class="dark-gray"[^>]*>([\s\S]*?)<\/td>/.exec(card)?.[1] ?? ''))
  const deadline = deadlineAfter(closes, sent)
  return { ...link, ...facts, ...(deadline && { deadline }) }
}

function parseAlert(message: AlertMessage): AdCandidate[] {
  const end = message.html.indexOf(RECOMMENDATIONS)
  const matched = end < 0 ? message.html : message.html.slice(0, end)
  const cards = matched.split(/(?=<a class="dark-white")/).slice(1)
  return cards.map((card) => candidateOf(card, message.date)).filter((candidate) => candidate !== null)
}

export const duunitori: SourceConnector = {
  id: 'duunitori',
  mode: 'handover',
  matches: (message) => message.from === 'duunivahti@duunitori.fi' && message.subject.startsWith('Duunitori löysi'),
  parseAlert,
}
