interface PaginationProps {
  label: string
  unit: string
  page: number
  pageCount: number
  onChange: (page: number) => void
}

export function Pagination({ label, unit, page, pageCount, onChange }: PaginationProps) {
  if (pageCount <= 1) return null

  return (
    <nav className="pager" aria-label={label}>
      <button
        type="button"
        className="button"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
      >
        Previous
      </button>
      <span aria-live="polite">
        {unit} {page} of {pageCount}
      </span>
      <button
        type="button"
        className="button"
        disabled={page === pageCount}
        onClick={() => onChange(page + 1)}
      >
        Next
      </button>
    </nav>
  )
}
