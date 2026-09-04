import type { User } from '../types.ts'

interface NavBarProps {
  user: User | null
  onLogout: () => Promise<void>
}

export function NavBar({ user, onLogout }: NavBarProps) {
  return (
    <nav className="nav-bar">
      <h1>Job applications</h1>
      {user && (
        <div className="nav-bar-session">
          <span>{user.username}</span>
          <button type="button" className="button" onClick={onLogout}>
            Log out
          </button>
        </div>
      )}
    </nav>
  )
}
