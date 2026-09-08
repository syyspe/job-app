import { SORT_FIELDS } from '../lib/sorting.ts'
import type { Sort, SortField } from '../lib/sorting.ts'

const FIELD_LABELS: Record<SortField, string> = {
  status: 'Status',
  dateApplied: 'Date applied',
  deadline: 'Deadline',
  createdAt: 'Created',
  updatedAt: 'Updated',
}

interface ApplicationSortProps {
  sort: Sort
  onChange: (sort: Sort) => void
}

export function ApplicationSort({ sort, onChange }: ApplicationSortProps) {
  return (
    <div className="sort-bar">
      <label>
        Sort by
        <select
          value={sort.field}
          onChange={(e) => onChange({ ...sort, field: e.target.value as SortField })}
        >
          {SORT_FIELDS.map((field) => (
            <option key={field} value={field}>
              {FIELD_LABELS[field]}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Direction</legend>
        <label>
          <input
            type="radio"
            name="sort-direction"
            value="asc"
            checked={sort.direction === 'asc'}
            onChange={() => onChange({ ...sort, direction: 'asc' })}
          />
          Ascending
        </label>
        <label>
          <input
            type="radio"
            name="sort-direction"
            value="desc"
            checked={sort.direction === 'desc'}
            onChange={() => onChange({ ...sort, direction: 'desc' })}
          />
          Descending
        </label>
      </fieldset>
    </div>
  )
}
