import type { User } from '../types.ts'

export type View = 'ads' | 'applications' | 'admin'

const NAV_ITEMS: { view: View; label: string; adminOnly: boolean }[] = [
  { view: 'ads', label: 'Ad inbox', adminOnly: false },
  { view: 'applications', label: 'Applications', adminOnly: false },
  { view: 'admin', label: 'Admin', adminOnly: true },
]

interface NavBarProps {
  user: User | null
  view: View
  onViewChange: (view: View) => void
  onLogout: () => Promise<void>
}

export function NavBar({ user, view, onViewChange, onLogout }: NavBarProps) {
  const items = NAV_ITEMS.filter(
    (item) => item.view !== view && (!item.adminOnly || user?.role === 'admin'),
  )

  return (
    <nav className="nav-bar">
      <h1>Job applications</h1>
      {user && (
        <div className="nav-bar-session">
          {items.map((item) => (
            <button
              key={item.view}
              type="button"
              className="button"
              onClick={() => onViewChange(item.view)}
            >
              {item.label}
            </button>
          ))}
          <span>{user.username}</span>
          <button type="button" className="button" onClick={onLogout}>
            Log out
          </button>
        </div>
      )}
    </nav>
  )
}
