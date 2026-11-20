// Valtiolle.fi, automatic.
//
// Alerts ("hakuvahti") come from hakuvahti@valtiolle.fi with the subject
// "Valtiolle.fi - Hakuvahtitulos". Each ad is an <a> around an
// <h3 class="job">: the employer is the first `job__sub` span, the title the
// `job__title` span, and "Hakuaika päättyy D.M.YYYY HH:MM" the last
// `job__sub`. Every link goes through the Mailjet click tracker
// (https://<x>.mjt.lu/lnk/<campaign>/<n>/<hash>/<target>), whose last path
// segment is the target URL in base64url. The connector decodes that segment
// and never requests the tracker. Targets are
// https://valtiolle.fi/fi/tyopaikat/<slug>-<id>/ plus utm parameters; the
// trailing number is the external id.
//
// The ad page's <article> holds the whole ad. It also carries a JSON-LD
// JobPosting with the employer (a bare name) and validThrough, but its
// description leaves out the requirements, the offer and the contacts, so the
// text comes from the article. The samples show no closed-ad page.
import { fetchAdPage, isoDate, linkOn, pageUrl } from './common.ts'
import { htmlToText, jobPostingOf } from './html.ts'
import type { AdCandidate, AlertMessage, SourceConnector } from './types.ts'

const HOSTS = ['valtiolle.fi']
const AD_PATH = /^\/fi\/tyopaikat\/[^/]+-(\d+)\/$/
const TRACKER = /^https:\/\/[a-z0-9]+\.mjt\.lu\/lnk\/[^/]+\/\d+\/[^/]+\/([A-Za-z0-9_-]+)/

function trackerTarget(href: string): string | null {
  const encoded = TRACKER.exec(href)?.[1]
  return encoded ? Buffer.from(encoded, 'base64url').toString('utf8') : null
}

function spans(inner: string, name: string): string[] {
  const pattern = new RegExp(`<span class="${name}"[^>]*>([\\s\\S]*?)</span>`, 'g')
  return [...inner.matchAll(pattern)].map(([, text]) => htmlToText(text))
}

function deadlineOf(text: string | undefined): string | undefined {
  const match = /päättyy (\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(text ?? '')
  return match ? isoDate(match[1], match[2], match[3]) : undefined
}

function candidateOf(href: string, inner: string): AdCandidate | null {
  const target = trackerTarget(href)
  const url = target ? linkOn(target, HOSTS) : null
  const id = url && AD_PATH.exec(url.pathname)?.[1]
  const [title] = spans(inner, 'job__title')
  if (!url || !id || !title) return null
  const [company, ...rest] = spans(inner, 'job__sub')
  const deadline = deadlineOf(rest.at(-1))
  return { externalId: id, url: pageUrl(url), title, ...(company && { company }), ...(deadline && { deadline }) }
}

function extract(html: string) {
  const article = /<article\b[\s\S]*?<\/article>/.exec(html)?.[0]
  if (!article) return null
  const posting = jobPostingOf(html)
  return { text: htmlToText(article), company: posting?.company, deadline: posting?.deadline }
}

function parseAlert(message: AlertMessage): AdCandidate[] {
  const anchors = message.html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)
  return [...anchors].map(([, href, inner]) => candidateOf(href, inner)).filter((candidate) => candidate !== null)
}

export const valtiolle: SourceConnector = {
  id: 'valtiolle',
  mode: 'automatic',
  fetchHosts: HOSTS,
  matches: (message) => message.from === 'hakuvahti@valtiolle.fi' && message.subject.includes('Hakuvahtitulos'),
  parseAlert,
  fetchAd: (candidate, http) => fetchAdPage(candidate.url, http, extract),
}
