import { STATUSES } from '../types.ts'

export interface ApplicationInput {
  company: string
  role: string
  dateApplied: string
  status: string
  link: string
  notes: string
}

export function validateInput(body: unknown): ApplicationInput | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as Record<string, unknown>
  const company = typeof b.company === 'string' ? b.company : ''
  const role = typeof b.role === 'string' ? b.role : ''
  const dateApplied = typeof b.dateApplied === 'string' ? b.dateApplied : ''
  const status = typeof b.status === 'string' ? b.status : ''
  const link = typeof b.link === 'string' ? b.link : ''
  const notes = typeof b.notes === 'string' ? b.notes : ''

  if (!company || !role) return null
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) return null
  if (status !== 'draft' && !dateApplied) return null

  return { company, role, dateApplied, status, link, notes }
}
