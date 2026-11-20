// Academic Work (www.academicwork.fi), automatic.
//
// Alerts come from no-reply@academicwork.fi with the subject "Duunivahtisi
// uusimmat työpaikat". Each ad is a `jobCard` table whose `jobDetailsWrapper`
// holds the title in its first div ("Role, Employer, City") and
// "City | Extent | Category" in the second. Its links go straight to
// https://www.academicwork.fi/avoimet-tyopaikat/j/<slug>/<ID>, with only utm
// parameters added; the ID (e.g. "AB12CD") is the external id.
//
// The ad page is a server-rendered page whose <main> opens with a <section>
// holding the whole ad, with "Company:" labelling the employer. The samples
// show no JSON-LD, no deadline and no closed-ad page.
import { fetchAdPage, linkOn, pageUrl } from './common.ts'
import { htmlToText, linksOf } from './html.ts'
import type { AdCandidate, AlertMessage, SourceConnector } from './types.ts'

const HOSTS = ['www.academicwork.fi']
const AD_PATH = /^\/avoimet-tyopaikat\/j\/[^/]+\/([A-Z0-9]+)$/

function firstDivs(card: string): string[] {
  const details = /class="jobDetailsWrapper"[^>]*>([\s\S]*)/.exec(card)?.[1] ?? ''
  return [...details.matchAll(/<div[^>]*>([\s\S]*?)<\/div>/g)].map(([, inner]) => htmlToText(inner))
}

function candidateOf(card: string): AdCandidate | null {
  for (const { href } of linksOf(card)) {
    const url = linkOn(href, HOSTS)
    const id = url && AD_PATH.exec(url.pathname)?.[1]
    if (!url || !id) continue
    const [title, facts = ''] = firstDivs(card)
    if (!title) return null
    const location = facts.split('|')[0].trim()
    return { externalId: id, url: pageUrl(url), title, ...(location && { location }) }
  }
  return null
}

function parseAlert(message: AlertMessage): AdCandidate[] {
  const cards = message.html.split(/(?=<table class="jobCard")/).slice(1)
  return cards.map(candidateOf).filter((candidate) => candidate !== null)
}

function extract(html: string) {
  const main = /<main\b[\s\S]*?<section\b[^>]*>([\s\S]*?)<\/section>/.exec(html)?.[1]
  if (!main) return null
  const text = htmlToText(main)
  const company = /^Company:\n(.+)$/m.exec(text)?.[1]
  return { text, ...(company && { company }) }
}

export const academicWork: SourceConnector = {
  id: 'academicwork',
  mode: 'automatic',
  fetchHosts: HOSTS,
  matches: (message) => message.from.endsWith('@academicwork.fi') && message.subject.includes('Duunivahti'),
  parseAlert,
  fetchAd: (candidate, http) => fetchAdPage(candidate.url, http, extract),
}
