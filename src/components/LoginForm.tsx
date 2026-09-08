import { useState } from 'react'
import type { FormEvent } from 'react'

interface LoginFormProps {
  onLogin: (username: string, password: string) => Promise<void>
}

export function LoginForm({ onLogin }: LoginFormProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    await onLogin(username, password)
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Username
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      <div className="form-actions">
        <button type="submit" className="button button-primary">
          Log in
        </button>
      </div>
    </form>
  )
}
