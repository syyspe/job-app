// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest'
import { logError } from './logging.ts'

afterEach(() => {
  vi.restoreAllMocks()
})

test('a 4xx logs one line of method, path, status and message', () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

  logError({ method: 'POST', path: '/api/login' }, 415, new Error('unsupported type'))

  expect(spy).toHaveBeenCalledTimes(1)
  expect(spy).toHaveBeenCalledWith('POST /api/login 415 unsupported type')
})

test('a 5xx logs the stack as well', () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const error = new Error('it broke')

  logError({ method: 'GET', path: '/api/applications' }, 500, error)

  expect(spy).toHaveBeenCalledTimes(2)
  expect(spy).toHaveBeenNthCalledWith(1, 'GET /api/applications 500 it broke')
  expect(spy).toHaveBeenNthCalledWith(2, error.stack)
})
