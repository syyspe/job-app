import { ROLES, STATUSES } from '../types.ts'
import type { Role } from '../types.ts'
import { HttpError } from './httpError.ts'

export interface ApplicationInput {
  company: string
  role: string
  dateApplied: string
  deadline: string
  status: string
  link: string
  notes: string
}

export interface UserInput {
  username: string
  password: string
  role: Role
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

// Express 5 leaves req.body undefined when no parser matched the request.
function fieldsOf(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'request body must be a JSON object')
  }
  return body as Record<string, unknown>
}

function isRole(value: unknown): value is Role {
  return ROLES.includes(value as Role)
}

function roleOf(fields: Record<string, unknown>): Role {
  if (!isRole(fields.role)) {
    throw new HttpError(400, `role must be one of: ${ROLES.join(', ')}`)
  }
  return fields.role
}

function passwordOf(fields: Record<string, unknown>): string {
  const password = text(fields.password)
  if (!password) throw new HttpError(400, 'password is required')
  return password
}

export function validateInput(body: unknown): ApplicationInput {
  const fields = fieldsOf(body)
  const company = text(fields.company)
  if (!company) throw new HttpError(400, 'company is required')
  const role = text(fields.role)
  if (!role) throw new HttpError(400, 'role is required')
  const deadline = fields.deadline ?? ''
  if (typeof deadline !== 'string') throw new HttpError(400, 'deadline must be a string')
  const status = text(fields.status)
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
    throw new HttpError(400, `status must be one of: ${STATUSES.join(', ')}`)
  }
  const dateApplied = text(fields.dateApplied)
  if (status !== 'draft' && !dateApplied) {
    throw new HttpError(400, 'dateApplied is required unless status is draft')
  }

  const link = text(fields.link)
  const notes = text(fields.notes)
  return { company, role, dateApplied, deadline, status, link, notes }
}

export function validateUserInput(body: unknown): UserInput {
  const fields = fieldsOf(body)
  const username = text(fields.username)
  if (!username) throw new HttpError(400, 'username is required')
  const password = passwordOf(fields)
  return { username, password, role: roleOf(fields) }
}

export function validateRole(body: unknown): Role {
  return roleOf(fieldsOf(body))
}

export function validatePassword(body: unknown): string {
  return passwordOf(fieldsOf(body))
}
