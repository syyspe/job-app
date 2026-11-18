// @vitest-environment node
import { expect, test } from 'vitest'
import { canonicalUrl, normaliseText } from './adDedup.ts'

test('lowercases the host and drops the fragment', () => {
  expect(canonicalUrl('https://Jobs.Example.COM/Open/1#apply')).toBe(
    'https://jobs.example.com/Open/1',
  )
})

test('drops a trailing slash, also before a query', () => {
  expect(canonicalUrl('https://example.com/job/')).toBe('https://example.com/job')
  expect(canonicalUrl('https://example.com/job/?id=1')).toBe('https://example.com/job?id=1')
})

test('the site root has one canonical form', () => {
  expect(canonicalUrl('https://example.com/')).toBe(canonicalUrl('https://example.com'))
})

test('drops tracking parameters and keeps the rest', () => {
  const url =
    'https://example.com/job?id=7&utm_source=mail&UTM_Campaign=x&gclid=1&fbclid=2&msclkid=3&mc_cid=4&mc_eid=5'
  expect(canonicalUrl(url)).toBe('https://example.com/job?id=7')
})

test('a url that does not parse has no canonical form', () => {
  expect(canonicalUrl('not a url')).toBeNull()
  expect(canonicalUrl('')).toBeNull()
})

test('only http and https urls have a canonical form', () => {
  expect(canonicalUrl('javascript:alert(1)')).toBeNull()
  expect(canonicalUrl('ftp://example.com/job')).toBeNull()
  expect(canonicalUrl('http://example.com/job')).toBe('http://example.com/job')
})

test('normalises width, case and whitespace', () => {
  expect(normaliseText('  Ａcme\t  OY\n')).toBe('acme oy')
})
