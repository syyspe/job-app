import { expect, test } from 'vitest'
import { paginate } from './paging.ts'

const items = ['a', 'b', 'c', 'd', 'e']

test('page 1 holds the first slice', () => {
  expect(paginate(items, 1, 2)).toEqual({ items: ['a', 'b'], page: 1, pageCount: 3 })
})

test('page 2 holds the next slice', () => {
  expect(paginate(items, 2, 2).items).toEqual(['c', 'd'])
})

test('the last page may be partial', () => {
  expect(paginate(items, 3, 2).items).toEqual(['e'])
})

test('an exact multiple leaves no empty trailing page', () => {
  expect(paginate(['a', 'b', 'c', 'd'], 1, 2).pageCount).toBe(2)
})

test('a page past the last one clamps to the last and reports it', () => {
  expect(paginate(items, 9, 2)).toEqual({ items: ['e'], page: 3, pageCount: 3 })
})

test('a page below one clamps up', () => {
  expect(paginate(items, 0, 2).page).toBe(1)
})

test('no items still makes one empty page', () => {
  expect(paginate([], 1, 2)).toEqual({ items: [], page: 1, pageCount: 1 })
})

test('an unknown page size puts everything on one page', () => {
  expect(paginate(items, 3, null)).toEqual({ items, page: 1, pageCount: 1 })
})
