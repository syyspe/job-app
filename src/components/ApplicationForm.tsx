import { useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import { STATUSES } from '../types.ts'
import type { ApplicationInput, Status } from '../types.ts'

const emptyInput: ApplicationInput = {
  company: '',
  role: '',
  dateApplied: '',
  deadline: '',
  status: 'draft',
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
  children?: ReactNode
  actions?: ReactNode
}

export function ApplicationForm({
  initial,
  submitLabel,
  onSubmit,
  children,
  actions,
}: ApplicationFormProps) {
  const [input, setInput] = useState<ApplicationInput>(initial ?? emptyInput)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSubmit(input)
    if (!initial) setInput(emptyInput)
  }

  function handleDateChange(event: ChangeEvent<HTMLInputElement>) {
    const dateApplied = event.target.value
    const applyingDraft = input.status === 'draft' && dateApplied !== ''
    setInput({
      ...input,
      dateApplied,
      status: applyingDraft ? 'applied' : input.status,
    })
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
          required={input.status !== 'draft'}
        />
      </label>
      <TextField
        label="Deadline"
        type="date"
        value={input.deadline}
        onChange={(value) => setInput({ ...input, deadline: value })}
      />
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
      {children}
      <div className="form-actions">
        <button type="submit" className="button button-primary">
          {submitLabel}
        </button>
        {actions}
      </div>
    </form>
  )
}
