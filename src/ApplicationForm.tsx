import { useState } from 'react'
import type { FormEvent } from 'react'
import { STATUSES } from './types.ts'
import type { ApplicationInput, Status } from './types.ts'

const emptyInput: ApplicationInput = {
  company: '',
  role: '',
  dateApplied: '',
  status: 'applied',
  link: '',
  notes: '',
}

interface ApplicationFormProps {
  initial?: ApplicationInput
  submitLabel: string
  onSubmit: (input: ApplicationInput) => void
  onCancel?: () => void
}

export function ApplicationForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: ApplicationFormProps) {
  const [input, setInput] = useState<ApplicationInput>(initial ?? emptyInput)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSubmit(input)
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Company
        <input
          value={input.company}
          onChange={(e) => setInput({ ...input, company: e.target.value })}
          required
        />
      </label>
      <label>
        Role
        <input
          value={input.role}
          onChange={(e) => setInput({ ...input, role: e.target.value })}
          required
        />
      </label>
      <label>
        Date applied
        <input
          type="date"
          value={input.dateApplied}
          onChange={(e) => setInput({ ...input, dateApplied: e.target.value })}
          required
        />
      </label>
      <label>
        Status
        <select
          value={input.status}
          onChange={(e) =>
            setInput({ ...input, status: e.target.value as Status })
          }
        >
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>
      <label>
        Link
        <input
          type="url"
          value={input.link}
          onChange={(e) => setInput({ ...input, link: e.target.value })}
        />
      </label>
      <label>
        Notes
        <textarea
          value={input.notes}
          onChange={(e) => setInput({ ...input, notes: e.target.value })}
        />
      </label>
      <div>
        <button type="submit">{submitLabel}</button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
