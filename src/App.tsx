import { useEffect, useState } from 'react'
import { AdminView } from './components/AdminView.tsx'
import { AdsView } from './components/AdsView.tsx'
import { ApplicationsView } from './components/ApplicationsView.tsx'
import { LoginForm } from './components/LoginForm.tsx'
import { NavBar } from './components/NavBar.tsx'
import type { View } from './components/NavBar.tsx'
import { adIdFromHash } from './lib/adLink.ts'
import { getCurrentUser, login, logout } from './lib/api.ts'
import { useToast } from './lib/toast.ts'
import type { User } from './types.ts'
import './App.css'
import './applications.css'
import './admin.css'
import './ads.css'

function useCurrentUser() {
  const [user, setUser] = useState<User | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const currentUser = await getCurrentUser()
        setUser(currentUser)
      } finally {
        setLoaded(true)
      }
    }
    void load()
  }, [])

  return { user, setUser, loaded }
}

/** The ad a summary link names, read once: the hash outlives the in-page login. */
function useLinkedAd() {
  const [focusAdId] = useState(() => adIdFromHash(window.location.hash) ?? undefined)
  const initialView: View = focusAdId === undefined ? 'applications' : 'ads'
  return { focusAdId, initialView }
}

function App() {
  const { user, setUser, loaded } = useCurrentUser()
  const { focusAdId, initialView } = useLinkedAd()
  const [view, setView] = useState<View>(initialView)
  const { showSuccess, showError } = useToast()

  async function handleLogin(username: string, password: string) {
    try {
      setUser(await login(username, password))
      showSuccess('Logged in')
    } catch {
      showError('Invalid username or password')
    }
  }

  async function handleLogout() {
    await logout()
    setUser(null)
    setView('applications')
    showSuccess('Logged out')
  }

  return (
    <>
      <NavBar user={user} view={view} onViewChange={setView} onLogout={handleLogout} />
      <main>
        {loaded && !user && <LoginForm onLogin={handleLogin} />}
        {user && view === 'applications' && (
          <ApplicationsView onUnauthorized={() => setUser(null)} />
        )}
        {user && view === 'ads' && (
          <AdsView
            onUnauthorized={() => setUser(null)}
            canRunAgent={user.agentAccess}
            focusAdId={focusAdId}
          />
        )}
        {user && view === 'admin' && <AdminView onUnauthorized={() => setUser(null)} />}
      </main>
    </>
  )
}

export default App
