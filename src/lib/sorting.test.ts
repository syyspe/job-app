import { expect, test } from 'vitest'
import { sortApplications } from './sorting.ts'
import type { Application } from '../types.ts'

const applications: Application[] = [
  {
    id: 1,
    company: 'Acme',
    role: 'Engineer',
    dateApplied: '2026-01-01',
    deadline: '2026-03-01',
    status: 'interview',
    link: '',
    notes: '',
    createdAt: '2026-01-01 10:00:00',
    updatedAt: '2026-01-05 10:00:00',
    attachments: [],
  },
  {
    id: 2,
    company: 'Globex',
    role: 'Designer',
    dateApplied: '2026-02-01',
    deadline: '',
    status: 'draft',
    link: '',
    notes: '',
    createdAt: '2026-01-02 10:00:00',
    updatedAt: '2026-01-02 10:00:00',
    attachments: [],
  },
  {
    id: 3,
    company: 'Initech',
    role: 'Manager',
    dateApplied: '2026-01-15',
    deadline: '2026-02-01',
    status: 'applied',
    link: '',
    notes: '',
    createdAt: '2026-01-03 10:00:00',
    updatedAt: '2026-01-10 10:00:00',
    attachments: [],
  },
]

function ids(sorted: Application[]): number[] {
  return sorted.map((application) => application.id)
}

test('sorts by status in pipeline order, not alphabetically', () => {
  expect(ids(sortApplications(applications, { field: 'status', direction: 'asc' }))).toEqual([
    2, 3, 1,
  ])
  expect(ids(sortApplications(applications, { field: 'status', direction: 'desc' }))).toEqual([
    1, 3, 2,
  ])
})

test('sorts by date applied', () => {
  expect(
    ids(sortApplications(applications, { field: 'dateApplied', direction: 'asc' })),
  ).toEqual([1, 3, 2])
  expect(
    ids(sortApplications(applications, { field: 'dateApplied', direction: 'desc' })),
  ).toEqual([2, 3, 1])
})

test('sorts by created date', () => {
  expect(ids(sortApplications(applications, { field: 'createdAt', direction: 'asc' }))).toEqual([
    1, 2, 3,
  ])
  expect(ids(sortApplications(applications, { field: 'createdAt', direction: 'desc' }))).toEqual([
    3, 2, 1,
  ])
})

test('sorts by updated date', () => {
  expect(ids(sortApplications(applications, { field: 'updatedAt', direction: 'asc' }))).toEqual([
    2, 1, 3,
  ])
  expect(ids(sortApplications(applications, { field: 'updatedAt', direction: 'desc' }))).toEqual([
    3, 1, 2,
  ])
})

test('sorts by deadline, with blank deadlines last in both directions', () => {
  expect(ids(sortApplications(applications, { field: 'deadline', direction: 'asc' }))).toEqual([
    3, 1, 2,
  ])
  expect(ids(sortApplications(applications, { field: 'deadline', direction: 'desc' }))).toEqual([
    1, 3, 2,
  ])
})

test('does not mutate the input array', () => {
  const original = [...applications]
  sortApplications(applications, { field: 'status', direction: 'asc' })
  expect(applications).toEqual(original)
})
