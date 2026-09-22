interface ArchivedToggleProps {
  count: number
  showArchived: boolean
  onChange: (showArchived: boolean) => void
}

export function ArchivedToggle({ count, showArchived, onChange }: ArchivedToggleProps) {
  if (count === 0) return null

  return (
    <button
      type="button"
      className="button archived-toggle"
      onClick={() => onChange(!showArchived)}
    >
      {showArchived ? 'Hide archived' : `Show ${count} archived`}
    </button>
  )
}
