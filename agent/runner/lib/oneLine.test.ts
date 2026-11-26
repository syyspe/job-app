// @vitest-environment node
import { expect, test } from 'vitest'
import { oneLine } from './oneLine.ts'

test('line breaks and control characters become spaces', () => {
  expect(oneLine('a\nb\r\nc d\u0007e')).toBe('a b  c d e')
})
