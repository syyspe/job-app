import { AD_STATES, SOURCE_MODES } from '../types.ts'
import type { AdEvaluation, AdState, SourceMode } from '../types.ts'
import { canonicalUrl } from './adDedup.ts'
import { HttpError } from './httpError.ts'
import { fieldsOf, validateInput } from './validation.ts'
import type { ApplicationInput } from './validation.ts'

// A fixed category, so ad text can never reach last_error.
const ERROR_CATEGORY = /^[a-z0-9_]{1,40}$/

type Fields = Record<string, unknown>

export interface AdIngest {
  source: string
  sourceMode: SourceMode
  url: string
  canonicalUrl: string
  externalId: string
  title: string
  company: string
  location: string
  deadline: string
}

export interface AdTransition {
  to: AdState
  body?: string
  evaluation?: AdEvaluation
  error?: string
}

export interface AdHandover {
  text: string
  url?: string
  canonicalUrl?: string
  title?: string
  company?: string
}

function optionalText(fields: Fields, name: string): string | undefined {
  const value = fields[name]
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new HttpError(400, `${name} must be a string`)
  return value
}

function requiredText(fields: Fields, name: string): string {
  const value = optionalText(fields, name)
  if (!value?.trim()) throw new HttpError(400, `${name} is required`)
  return value
}

function canonicalOf(url: string): string {
  const canonical = canonicalUrl(url)
  if (canonical === null) throw new HttpError(400, 'url must be an http or https URL')
  return canonical
}

function sourceModeOf(fields: Fields): SourceMode {
  const mode = SOURCE_MODES.find((candidate) => candidate === fields.sourceMode)
  if (!mode) throw new HttpError(400, `sourceMode must be one of: ${SOURCE_MODES.join(', ')}`)
  return mode
}

function isAdState(value: unknown): value is AdState {
  return AD_STATES.includes(value as AdState)
}

function isEvaluation(value: unknown): value is AdEvaluation {
  if (typeof value !== 'object' || value === null) return false
  const { verdict, fitSummary, reasons } = value as Fields
  return (
    (verdict === 'suitable' || verdict === 'unsuitable') &&
    typeof fitSummary === 'string' &&
    Array.isArray(reasons) &&
    reasons.every((reason) => typeof reason === 'string')
  )
}

function evaluationOf(fields: Fields, to: AdState): AdEvaluation | undefined {
  const value = fields.evaluation
  if (value === undefined) return undefined
  if (!isEvaluation(value) || value.verdict !== to) {
    throw new HttpError(400, 'evaluation must be {verdict, fitSummary, reasons} matching to')
  }
  return { verdict: value.verdict, fitSummary: value.fitSummary, reasons: value.reasons }
}

function errorOf(fields: Fields, to: AdState): string | undefined {
  const error = optionalText(fields, 'error')
  if (error !== undefined && !ERROR_CATEGORY.test(error)) {
    throw new HttpError(400, 'error must be a category matching ^[a-z0-9_]{1,40}$')
  }
  if (to === 'failed' && error === undefined) {
    throw new HttpError(400, 'error is required when to is failed')
  }
  return error
}

export function parseAdIngest(body: unknown): AdIngest {
  const fields = fieldsOf(body)
  const url = requiredText(fields, 'url')
  const canonical = canonicalOf(url)
  return {
    source: requiredText(fields, 'source'),
    sourceMode: sourceModeOf(fields),
    url,
    canonicalUrl: canonical,
    externalId: optionalText(fields, 'externalId') || canonical,
    title: requiredText(fields, 'title'),
    company: optionalText(fields, 'company') ?? '',
    location: optionalText(fields, 'location') ?? '',
    deadline: optionalText(fields, 'deadline') ?? '',
  }
}

export function parseAdTransition(body: unknown): AdTransition {
  const fields = fieldsOf(body)
  const { to } = fields
  if (!isAdState(to)) throw new HttpError(400, `to must be one of: ${AD_STATES.join(', ')}`)
  return {
    to,
    body: optionalText(fields, 'body'),
    evaluation: evaluationOf(fields, to),
    error: errorOf(fields, to),
  }
}

export function parseAdHandover(body: unknown): AdHandover {
  const fields = fieldsOf(body)
  const url = optionalText(fields, 'url')
  return {
    text: requiredText(fields, 'text'),
    url,
    canonicalUrl: url === undefined ? undefined : canonicalOf(url),
    title: optionalText(fields, 'title'),
    company: optionalText(fields, 'company'),
  }
}

export function parseReportedIds(body: unknown): number[] {
  const { ids } = fieldsOf(body)
  if (!Array.isArray(ids) || !ids.every((id) => Number.isInteger(id))) {
    throw new HttpError(400, 'ids must be an array of ad ids')
  }
  return ids as number[]
}

export function parseStateFilter(state: unknown): AdState | undefined {
  if (state === undefined) return undefined
  if (!isAdState(state)) throw new HttpError(400, `state must be one of: ${AD_STATES.join(', ')}`)
  return state
}

// multipart/form-data encodes every line break in a text field as CRLF; notes
// made through the JSON routes use LF.
function lfNotes(notes: unknown): unknown {
  return typeof notes === 'string' ? notes.replaceAll('\r\n', '\n') : notes
}

// The server fixes status and dateApplied: the agent can only create a draft.
export function parseAdDraft(body: unknown): ApplicationInput {
  const { company, role, deadline, link, notes } = fieldsOf(body)
  return validateInput({
    company,
    role,
    deadline,
    link,
    notes: lfNotes(notes),
    status: 'draft',
    dateApplied: '',
  })
}
