import { useState } from 'react'
import type { FormEvent } from 'react'
import type { AdHandoverInput } from '../types.ts'

interface TextFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
}

function TextField({ label, value, onChange }: TextFieldProps) {
  return (
    <label>
      {label}
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

interface AdHandoverFormProps {
  title: string
  company: string
  onSubmit: (input: AdHandoverInput) => void
  onCancel: () => void
}

export function AdHandoverForm({ title, company, onSubmit, onCancel }: AdHandoverFormProps) {
  const [input, setInput] = useState<AdHandoverInput>({ text: '', title, company })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSubmit(input)
  }

  return (
    <form className="ad-handover" onSubmit={handleSubmit}>
      <label>
        Ad text
        <textarea
          value={input.text}
          onChange={(e) => setInput({ ...input, text: e.target.value })}
          required
        />
      </label>
      <TextField
        label="Title"
        value={input.title}
        onChange={(value) => setInput({ ...input, title: value })}
      />
      <TextField
        label="Company"
        value={input.company}
        onChange={(value) => setInput({ ...input, company: value })}
      />
      <div className="form-actions">
        <button type="submit" className="button button-primary">
          Hand over ad
        </button>
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
