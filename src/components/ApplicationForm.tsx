import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { STATUS_LABELS } from '../lib/status.ts'
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

function withDateApplied(
  input: ApplicationInput,
  dateApplied: string,
): ApplicationInput {
  const applyingDraft = input.status === 'draft' && dateApplied !== ''
  return {
    ...input,
    dateApplied,
    status: applyingDraft ? 'applied' : input.status,
  }
}

interface StatusFieldProps {
  value: Status
  onChange: (value: Status) => void
}

function StatusField({ value, onChange }: StatusFieldProps) {
  return (
    <label>
      Status
      <select value={value} onChange={(e) => onChange(e.target.value as Status)}>
        {STATUSES.map((status) => (
          <option key={status} value={status}>
            {STATUS_LABELS[status]}
          </option>
        ))}
      </select>
    </label>
  )
}

interface NotesFieldProps {
  value: string
  onChange: (value: string) => void
}

function NotesField({ value, onChange }: NotesFieldProps) {
  return (
    <label>
      Notes
      <textarea value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

interface FieldsProps {
  input: ApplicationInput
  onChange: (input: ApplicationInput) => void
}

function OpeningFields({ input, onChange }: FieldsProps) {
  return (
    <>
      <TextField
        label="Company"
        value={input.company}
        onChange={(value) => onChange({ ...input, company: value })}
        required
      />
      <TextField
        label="Role"
        value={input.role}
        onChange={(value) => onChange({ ...input, role: value })}
        required
      />
      <TextField
        label="Date applied"
        type="date"
        value={input.dateApplied}
        onChange={(value) => onChange(withDateApplied(input, value))}
        required={input.status !== 'draft'}
      />
      <TextField
        label="Deadline"
        type="date"
        value={input.deadline}
        onChange={(value) => onChange({ ...input, deadline: value })}
      />
    </>
  )
}

function TrackingFields({ input, onChange }: FieldsProps) {
  return (
    <>
      <StatusField
        value={input.status}
        onChange={(value) => onChange({ ...input, status: value })}
      />
      <TextField
        label="Link"
        type="url"
        value={input.link}
        onChange={(value) => onChange({ ...input, link: value })}
      />
      <NotesField
        value={input.notes}
        onChange={(value) => onChange({ ...input, notes: value })}
      />
    </>
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

  return (
    <form onSubmit={handleSubmit}>
      <OpeningFields input={input} onChange={setInput} />
      <TrackingFields input={input} onChange={setInput} />
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
