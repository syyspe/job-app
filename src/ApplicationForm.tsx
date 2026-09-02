import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
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

interface TextFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  required?: boolean
}

function TextField({ label, value, onChange, type, required }: TextFieldProps) {
  return (
    <label>
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
    </label>
  )
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

  useEffect(() => {
    setInput(initial ?? emptyInput)
  }, [initial])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSubmit(input)
  }

  function handleDateChange(event: ChangeEvent<HTMLInputElement>) {
    setInput({ ...input, dateApplied: event.target.value })
  }

  function handleStatusChange(event: ChangeEvent<HTMLSelectElement>) {
    setInput({ ...input, status: event.target.value as Status })
  }

  function handleNotesChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setInput({ ...input, notes: event.target.value })
  }

  return (
    <form onSubmit={handleSubmit}>
      <TextField
        label="Company"
        value={input.company}
        onChange={(value) => setInput({ ...input, company: value })}
        required
      />
      <TextField
        label="Role"
        value={input.role}
        onChange={(value) => setInput({ ...input, role: value })}
        required
      />
      <label>
        Date applied
        <input
          type="date"
          value={input.dateApplied}
          onChange={handleDateChange}
          required
        />
      </label>
      <label>
        Status
        <select value={input.status} onChange={handleStatusChange}>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>
      <TextField
        label="Link"
        type="url"
        value={input.link}
        onChange={(value) => setInput({ ...input, link: value })}
      />
      <label>
        Notes
        <textarea value={input.notes} onChange={handleNotesChange} />
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
