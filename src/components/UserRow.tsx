import { useState } from 'react'
import type { FormEvent } from 'react'
import { ROLE_LABELS } from '../lib/roles.ts'
import { ROLES } from '../types.ts'
import type { Role, User } from '../types.ts'

type Mode = 'idle' | 'reset' | 'delete'

interface RoleSelectProps {
  username: string
  role: Role
  onChange: (role: Role) => void
}

function RoleSelect({ username, role, onChange }: RoleSelectProps) {
  return (
    <label className="user-role">
      <span className="visually-hidden">Role for {username}</span>
      <select value={role} onChange={(e) => onChange(e.target.value as Role)}>
        {ROLES.map((option) => (
          <option key={option} value={option}>
            {ROLE_LABELS[option]}
          </option>
        ))}
      </select>
    </label>
  )
}

interface ResetPasswordFormProps {
  username: string
  onSubmit: (password: string) => void
  onCancel: () => void
}

function ResetPasswordForm({ username, onSubmit, onCancel }: ResetPasswordFormProps) {
  const [password, setPassword] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSubmit(password)
  }

  return (
    <form className="user-reset" onSubmit={handleSubmit}>
      <label>
        New password for {username}
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      <button type="submit" className="button button-primary">
        Save
      </button>
      <button type="button" className="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  )
}

interface DeleteConfirmProps {
  username: string
  onConfirm: () => void
  onCancel: () => void
}

function DeleteConfirm({ username, onConfirm, onCancel }: DeleteConfirmProps) {
  return (
    <div className="user-confirm">
      <span>Delete {username} and everything they tracked?</span>
      <button type="button" className="button button-danger" onClick={onConfirm}>
        Confirm delete
      </button>
      <button type="button" className="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}

interface UserRowProps {
  user: User
  onSetRole: (role: Role) => void
  onResetPassword: (password: string) => void
  onDelete: () => void
}

export function UserRow({ user, onSetRole, onResetPassword, onDelete }: UserRowProps) {
  const [mode, setMode] = useState<Mode>('idle')

  function handleResetPassword(password: string) {
    onResetPassword(password)
    setMode('idle')
  }

  return (
    <li className="user-item" data-role={user.role}>
      <div className="user-head">
        <span className="user-name">{user.username}</span>
        <RoleSelect username={user.username} role={user.role} onChange={onSetRole} />
      </div>
      {mode === 'idle' && (
        <div className="user-actions">
          <button type="button" className="button" onClick={() => setMode('reset')}>
            Reset password
          </button>
          <button type="button" className="button" onClick={() => setMode('delete')}>
            Delete
          </button>
        </div>
      )}
      {mode === 'reset' && (
        <ResetPasswordForm
          username={user.username}
          onSubmit={handleResetPassword}
          onCancel={() => setMode('idle')}
        />
      )}
      {mode === 'delete' && (
        <DeleteConfirm
          username={user.username}
          onConfirm={onDelete}
          onCancel={() => setMode('idle')}
        />
      )}
    </li>
  )
}
