// @vitest-environment node
import { expect, test } from 'vitest'
import { HttpError } from './httpError.ts'
import {
  validateInput,
  validatePassword,
  validateRole,
  validateUserInput,
} from './validation.ts'

const APPLICATION = {
  company: 'Acme',
  role: 'Engineer',
  dateApplied: '2026-01-01',
  status: 'applied',
}

const USER = { username: 'someone', password: 'pw', role: 'basic' }

function rejectionOf(validate: () => unknown): HttpError {
  try {
    validate()
  } catch (error) {
    return error as HttpError
  }
  throw new Error('expected the validator to throw')
}

test.each([undefined, null, 'text', 42, []])('%o is not a JSON object', (body) => {
  for (const validate of [validateInput, validateUserInput, validateRole, validatePassword]) {
    const error = rejectionOf(() => validate(body))
    expect(error).toBeInstanceOf(HttpError)
    expect(error.status).toBe(400)
    expect(error.message).toBe('request body must be a JSON object')
  }
})

test.each([
  [{ company: '' }, 'company is required'],
  [{ role: undefined }, 'role is required'],
  [{ deadline: 5 }, 'deadline must be a string'],
  [{ status: 'ghosted' }, 'status must be one of: draft, applied, screening, interview, offer, rejected'],
  [{ dateApplied: '' }, 'dateApplied is required unless status is draft'],
])('an application with %o is refused: %s', (change, message) => {
  const error = rejectionOf(() => validateInput({ ...APPLICATION, ...change }))
  expect(error).toBeInstanceOf(HttpError)
  expect(error.status).toBe(400)
  expect(error.message).toBe(message)
})

test('a valid application passes through, a draft needing no date', () => {
  expect(validateInput(APPLICATION)).toEqual({
    ...APPLICATION,
    deadline: '',
    link: '',
    notes: '',
  })
  expect(validateInput({ company: 'Acme', role: 'Engineer', status: 'draft' }).dateApplied).toBe('')
})

test.each([
  [{ username: '' }, 'username is required'],
  [{ password: '' }, 'password is required'],
  [{ role: 'root' }, 'role must be one of: admin, basic'],
])('a user with %o is refused: %s', (change, message) => {
  const error = rejectionOf(() => validateUserInput({ ...USER, ...change }))
  expect(error.status).toBe(400)
  expect(error.message).toBe(message)
})

test('a role or a password on its own is checked the same way', () => {
  expect(validateRole({ role: 'admin' })).toBe('admin')
  expect(rejectionOf(() => validateRole({ role: 'root' })).message).toBe(
    'role must be one of: admin, basic',
  )
  expect(validatePassword({ password: 'new' })).toBe('new')
  expect(rejectionOf(() => validatePassword({ password: 42 })).message).toBe(
    'password is required',
  )
})
