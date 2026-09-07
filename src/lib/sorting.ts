import { STATUSES } from '../types.ts'
import type { Application } from '../types.ts'

export const SORT_FIELDS = ['status', 'dateApplied', 'deadline', 'createdAt', 'updatedAt'] as const
export type SortField = (typeof SORT_FIELDS)[number]

export interface Sort {
  field: SortField
  direction: 'asc' | 'desc'
}

function compareValues(a: Application, b: Application, field: SortField): number {
  if (field === 'status') return STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status)
  return a[field].localeCompare(b[field])
}

export function sortApplications(applications: Application[], sort: Sort): Application[] {
  const factor = sort.direction === 'asc' ? 1 : -1

  return [...applications].sort((a, b) => {
    if (sort.field === 'deadline') {
      if (a.deadline === '' && b.deadline === '') return 0
      if (a.deadline === '') return 1
      if (b.deadline === '') return -1
    }
    return compareValues(a, b, sort.field) * factor
  })
}
