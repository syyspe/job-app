// @vitest-environment node
import { expect, test } from 'vitest'
import { chunkText } from './chunk.ts'

test('short paragraphs pack into one chunk', () => {
  expect(chunkText('First.\n\nSecond.\r\n\r\nThird.')).toEqual(['First.\n\nSecond.\n\nThird.'])
})

test('paragraphs start a new chunk once 1500 characters would be exceeded', () => {
  const paragraph = 'a'.repeat(800)

  expect(chunkText(`${paragraph}\n\n${paragraph}`)).toEqual([paragraph, paragraph])
})

test('a paragraph longer than 1500 characters is cut at whitespace', () => {
  const words = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ')

  const chunks = chunkText(words)

  expect(chunks.length).toBeGreaterThan(1)
  for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(1500)
  expect(chunks.join(' ')).toBe(words)
})

test('empty or blank text gives no chunks', () => {
  expect(chunkText('')).toEqual([])
  expect(chunkText('  \n\n \n')).toEqual([])
})
