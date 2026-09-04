// @vitest-environment node
import { expect, test } from 'vitest'
import { hashPassword, verifyPassword } from './passwords.ts'

test('a hash verifies against its own password', () => {
  const hash = hashPassword('foobar')
  expect(verifyPassword('foobar', hash)).toBe(true)
})

test('a hash does not verify against a wrong password', () => {
  const hash = hashPassword('foobar')
  expect(verifyPassword('wrong', hash)).toBe(false)
})

test('two hashes of the same password differ', () => {
  const first = hashPassword('foobar')
  const second = hashPassword('foobar')
  expect(first).not.toBe(second)
})
