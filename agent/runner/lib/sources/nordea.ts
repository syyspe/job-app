// Nordea careers (careers.nordea.com, SAP SuccessFactors), automatic.
//
// Alerts come from nordeabank-jobnotification@<n>.jobs2web.com with the
// subject "New jobs posted from careers.nordea.com". Each ad is an
// <a class="agentjoblink"> whose text is "Title - City, CC, Postcode" and
// whose href is https://careers.nordea.com/job/<slug>/<id>/ plus tracking
// parameters, with no click tracker; the numeric id is the external id.
// Every ad is Nordea's own.
//
// The ad page has no JSON-LD. The ad is the `jobdescription` span, up to the
// page's second column (`jobColumnTwo`), and names its deadline as "no later
// than D/M/YYYY". The samples show no closed-ad page.
import { fetchAdPage, isoDate, linkOn, pageUrl } from './common.ts'
import { htmlToText, linksOf } from './html.ts'
import type { AdCandidate, AlertMessage, SourceConnector } from './types.ts'

const HOSTS = ['careers.nordea.com']
const AD_PATH = /^\/job\/[^/]+\/(\d+)\/$/
const SENDER = /^nordeabank-jobnotification@[a-z0-9]+\.jobs2web\.com$/

function jobLinks(html: string): string {
  return [...html.matchAll(/<a class="agentjoblink"[\s\S]*?<\/a>/g)].map(([anchor]) => anchor).join('\n')
}

function parseAlert(message: AlertMessage): AdCandidate[] {
  const candidates: AdCandidate[] = []
  for (const { href, text } of linksOf(jobLinks(message.html))) {
    const url = linkOn(href, HOSTS)
    const id = url && AD_PATH.exec(url.pathname)?.[1]
    const split = text.lastIndexOf(' - ')
    if (!url || !id || split < 1) continue
    const location = text.slice(split + 3).split(',')[0].trim()
    candidates.push({ externalId: id, url: pageUrl(url), title: text.slice(0, split), company: 'Nordea', location })
  }
  return candidates
}

function extract(html: string) {
  const description = /class="jobdescription"[^>]*>([\s\S]*?)<div class="jobColumnTwo"/.exec(html)?.[1]
  if (!description) return null
  const text = htmlToText(description)
  const date = /no later than (\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text)
  return { text, ...(date && { deadline: isoDate(date[1], date[2], date[3]) }) }
}

export const nordea: SourceConnector = {
  id: 'nordea',
  mode: 'automatic',
  fetchHosts: HOSTS,
  matches: (message) => SENDER.test(message.from) && message.subject.includes('careers.nordea.com'),
  parseAlert,
  fetchAd: (candidate, http) => fetchAdPage(candidate.url, http, extract),
}
