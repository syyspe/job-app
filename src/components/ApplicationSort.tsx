import { SORT_FIELDS, SORT_FIELD_LABELS, SORT_ORDER_LABELS } from '../lib/sorting.ts'
import type { Sort, SortField } from '../lib/sorting.ts'

interface ApplicationSortProps {
  sort: Sort
  onChange: (sort: Sort) => void
}

export function ApplicationSort({ sort, onChange }: ApplicationSortProps) {
  const offered = sort.direction === 'asc' ? 'desc' : 'asc'

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
              {SORT_FIELD_LABELS[field]}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="button"
        onClick={() => onChange({ ...sort, direction: offered })}
      >
        Sort {SORT_ORDER_LABELS[sort.field][offered]}
      </button>
    </div>
  )
}
