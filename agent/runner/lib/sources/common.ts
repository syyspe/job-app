// What the connectors share: link checks for untrusted alert emails, and the
// fetch-then-extract step of an automatic source.
import type { JobPosting } from './html.ts'
import type { FetchResult, PoliteHttp } from './types.ts'

// An alert's link as a URL, or null unless it is https on one of `hosts`.
export function linkOn(href: string, hosts: string[]): URL | null {
  const url = URL.parse(href)
  if (!url || url.protocol !== 'https:' || !hosts.includes(url.hostname)) return null
  return url
}

// The ad page itself: no query string or fragment, so tracking parameters
// never reach the stored URL or the site.
export function pageUrl(url: URL): string {
  return `${url.origin}${url.pathname}`
}

// An extractor returns the ad's text with what the page names, or null when
// the page holds no ad.
export async function fetchAdPage(
  url: string,
  http: PoliteHttp,
  extract: (html: string) => JobPosting | null,
): Promise<FetchResult> {
  const page = await http.get(url)
  if (page.kind !== 'page') return page
  const found = extract(page.html)
  if (!found?.text) return { kind: 'failed', category: 'no_ad_text' }
  const { text, company, deadline } = found
  return { kind: 'ok', text, ...(company && { company }), ...(deadline && { deadline }) }
}

// D.M.YYYY → YYYY-MM-DD.
export function isoDate(day: string, month: string, year: string): string {
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}
