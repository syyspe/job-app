import type { User } from '../types.ts'

export type View = 'applications' | 'admin'

interface NavBarProps {
  user: User | null
  view: View
  onViewChange: (view: View) => void
  onLogout: () => Promise<void>
}

export function NavBar({ user, view, onViewChange, onLogout }: NavBarProps) {
  return (
    <nav className="nav-bar">
      <h1>Job applications</h1>
      {user && (
        <div className="nav-bar-session">
          {user.role === 'admin' && (
            <button
              type="button"
              className="button"
              onClick={() => onViewChange(view === 'admin' ? 'applications' : 'admin')}
            >
              {view === 'admin' ? 'Applications' : 'Admin'}
            </button>
          )}
          <span>{user.username}</span>
          <button type="button" className="button" onClick={onLogout}>
            Log out
          </button>
        </div>
      )}
    </nav>
  )
}
