import { useEffect, useState } from 'react'
import { AdminView } from './components/AdminView.tsx'
import { ApplicationsView } from './components/ApplicationsView.tsx'
import { LoginForm } from './components/LoginForm.tsx'
import { NavBar } from './components/NavBar.tsx'
import type { View } from './components/NavBar.tsx'
import { getCurrentUser, login, logout } from './lib/api.ts'
import { useToast } from './lib/toast.ts'
import type { User } from './types.ts'
import './App.css'
import './applications.css'
import './admin.css'

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [view, setView] = useState<View>('applications')
  const [loaded, setLoaded] = useState(false)
  const { showSuccess, showError } = useToast()

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
        {user && view === 'admin' && <AdminView onUnauthorized={() => setUser(null)} />}
      </main>
    </>
  )
}

export default App
