import { ROLES, STATUSES } from '../types.ts'
import type { Role } from '../types.ts'

export interface ApplicationInput {
  company: string
  role: string
  dateApplied: string
  deadline: string
  status: string
  link: string
  notes: string
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function validateInput(body: unknown): ApplicationInput | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as Record<string, unknown>
  const company = text(b.company)
  const role = text(b.role)
  const dateApplied = text(b.dateApplied)
  const deadline = b.deadline ?? ''
  if (typeof deadline !== 'string') return null
  const status = text(b.status)
  const link = text(b.link)
  const notes = text(b.notes)

  if (!company || !role) return null
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) return null
  if (status !== 'draft' && !dateApplied) return null

  return { company, role, dateApplied, deadline, status, link, notes }
}

export interface UserInput {
  username: string
  password: string
  role: Role
}

export function isRole(value: unknown): value is Role {
  return ROLES.includes(value as Role)
}

export function validateUserInput(body: unknown): UserInput | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as Record<string, unknown>
  const username = text(b.username)
  const password = text(b.password)

  if (!username || !password) return null
  if (!isRole(b.role)) return null

  return { username, password, role: b.role }
}
