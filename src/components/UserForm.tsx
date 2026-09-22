import { useState } from 'react'
import type { FormEvent } from 'react'
import { ROLE_LABELS } from '../lib/roles.ts'
import { ROLES } from '../types.ts'
import type { Role, UserInput } from '../types.ts'

const emptyInput: UserInput = { username: '', password: '', role: 'basic' }

interface UserFormProps {
  onSubmit: (input: UserInput) => void
}

export function UserForm({ onSubmit }: UserFormProps) {
  const [input, setInput] = useState<UserInput>(emptyInput)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSubmit(input)
    setInput(emptyInput)
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Username
        <input
          type="text"
          value={input.username}
          onChange={(e) => setInput({ ...input, username: e.target.value })}
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={input.password}
          onChange={(e) => setInput({ ...input, password: e.target.value })}
          required
        />
      </label>
      <label>
        Role
        <select
          value={input.role}
          onChange={(e) => setInput({ ...input, role: e.target.value as Role })}
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </label>
      <div className="form-actions">
        <button type="submit" className="button button-primary">
          Add user
        </button>
      </div>
    </form>
  )
}
