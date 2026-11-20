// Plain-text views of alert emails and ad pages, with no HTML parser
// dependency: regular expressions over markup that is only ever read.
import { z } from 'zod'

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  auml: 'ä', ouml: 'ö', aring: 'å', Auml: 'Ä', Ouml: 'Ö', Aring: 'Å', uuml: 'ü', Uuml: 'Ü', eacute: 'é',
  ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  euro: '€', copy: '©', bull: '•', middot: '·',
}

const BLOCK_TAG = /<\/?(?:p|div|br|li|ul|ol|h[1-6]|tr|table|section|article|header|footer|blockquote)\b[^>]*>/gi

export interface Link {
  href: string
  text: string
}

export interface JobPosting {
  text: string
  company?: string
  deadline?: string
}

const MAX_CODE_POINT = 0x10ffff

// A numeric entity past Unicode's range stays as written: fromCodePoint would
// throw, and one malformed email would then stop every run at the same message.
function codePoint(entity: string, value: number): string {
  return value <= MAX_CODE_POINT ? String.fromCodePoint(value) : entity
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) return codePoint(entity, parseInt(name.slice(2), 16))
    if (name.startsWith('#')) return codePoint(entity, Number(name.slice(1)))
    return NAMED_ENTITIES[name] ?? entity
  })
}

function tidyLines(text: string): string {
  const lines = text.split('\n').map((line) => line.replace(/[ \t ]+/g, ' ').trim())
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function htmlToText(html: string): string {
  const visible = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, ' ')
    .replace(BLOCK_TAG, '\n')
    .replace(/<[^>]*>/g, '')
  return tidyLines(decodeEntities(visible))
}

function hrefOf(attributes: string): string | undefined {
  const match = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attributes)
  if (!match) return undefined
  return decodeEntities(match[1] ?? match[2] ?? match[3]).trim()
}

export function linksOf(html: string): Link[] {
  const links: Link[] = []
  for (const [, attributes, inner] of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const href = hrefOf(attributes)
    if (href) links.push({ href, text: htmlToText(inner).replace(/\s+/g, ' ') })
  }
  return links
}

const jobPostingSchema = z.object({
  '@type': z.literal('JobPosting'),
  description: z.string(),
  // Sites give the organization as an object or as a bare name.
  hiringOrganization: z.union([z.string(), z.object({ name: z.string() })]).optional(),
  validThrough: z.string().optional(),
})

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err
    return undefined
  }
}

// A JSON-LD block holds one item, a list of them, or an @graph of them.
function itemsOf(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  const graph = (value as { '@graph'?: unknown } | null)?.['@graph']
  return Array.isArray(graph) ? graph : [value]
}

function toJobPosting(posting: z.infer<typeof jobPostingSchema>): JobPosting {
  const deadline = /^\d{4}-\d{2}-\d{2}/.exec(posting.validThrough ?? '')?.[0]
  const organization = posting.hiringOrganization
  const company = (typeof organization === 'string' ? organization : organization?.name)?.trim()
  return { text: htmlToText(posting.description), ...(company && { company }), ...(deadline && { deadline }) }
}

export function jobPostingOf(html: string): JobPosting | null {
  const blocks = html.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script\s*>/gi)
  for (const item of [...blocks].flatMap(([, json]) => itemsOf(parseJson(json)))) {
    const posting = jobPostingSchema.safeParse(item)
    if (posting.success) return toJobPosting(posting.data)
  }
  return null
}
