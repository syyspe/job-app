import type Database from 'better-sqlite3'
import type { AdRow } from '../models/ad.ts'

const TRACKING_PARAMS = new Set(['gclid', 'fbclid', 'msclkid', 'mc_cid', 'mc_eid'])

/** A match against an application has no ad to point at, so `duplicateOf` is null. */
export interface DuplicateMatch {
  duplicateOf: number | null
}

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.startsWith('utm_') || TRACKING_PARAMS.has(lower)
}

function withoutTrailingSlashes(path: string): string {
  let trimmed = path
  while (trimmed.endsWith('/')) trimmed = trimmed.slice(0, -1)
  return trimmed
}

/** Null for anything but a parsable http or https URL. */
export function canonicalUrl(url: string): string | null {
  if (!URL.canParse(url)) return null
  const parsed = new URL(url)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

  for (const name of [...parsed.searchParams.keys()]) {
    if (isTrackingParam(name)) parsed.searchParams.delete(name)
  }
  return `${parsed.origin}${withoutTrailingSlashes(parsed.pathname)}${parsed.search}`
}

export function normaliseText(text: string): string {
  return text.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ')
}

export function findUrlDuplicate(db: Database.Database, ad: AdRow): DuplicateMatch | undefined {
  const other = db
    .prepare(
      `SELECT id FROM ads
        WHERE user_id = ? AND id <> ? AND canonical_url = ? AND state <> 'duplicate'
        ORDER BY id LIMIT 1`,
    )
    .get(ad.user_id, ad.id, ad.canonical_url) as { id: number } | undefined
  if (other) return { duplicateOf: other.id }

  const applications = db
    .prepare('SELECT link FROM applications WHERE user_id = ?')
    .all(ad.user_id) as { link: string }[]
  const matches = applications.some(({ link }) => canonicalUrl(link) === ad.canonical_url)
  return matches ? { duplicateOf: null } : undefined
}

export function findTitleDuplicate(db: Database.Database, ad: AdRow): DuplicateMatch | undefined {
  const company = normaliseText(ad.company)
  const title = normaliseText(ad.title)
  if (!company || !title) return undefined

  const isSame = (otherCompany: string, otherTitle: string) =>
    normaliseText(otherCompany) === company && normaliseText(otherTitle) === title

  // A later ad still waiting for its text is the repeat, so it is not a target.
  const ads = db
    .prepare(
      `SELECT id, company, title FROM ads
        WHERE user_id = ? AND id <> ? AND state <> 'duplicate'
          AND (id < ? OR state NOT IN ('new', 'awaiting_handover'))
          AND first_seen_at >= datetime('now', '-90 days')
        ORDER BY id`,
    )
    .all(ad.user_id, ad.id, ad.id) as { id: number; company: string; title: string }[]
  const other = ads.find((candidate) => isSame(candidate.company, candidate.title))
  if (other) return { duplicateOf: other.id }

  const applications = db
    .prepare('SELECT company, role FROM applications WHERE user_id = ?')
    .all(ad.user_id) as { company: string; role: string }[]
  const matches = applications.some((application) =>
    isSame(application.company, application.role),
  )
  return matches ? { duplicateOf: null } : undefined
}
