import { useEffect, useState } from 'react'
import { ApplicationsView } from './components/ApplicationsView.tsx'
import { LoginForm } from './components/LoginForm.tsx'
import { NavBar } from './components/NavBar.tsx'
import { getCurrentUser, login, logout } from './lib/api.ts'
import type { User } from './types.ts'
import './App.css'

function App() {
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
    // eslint-disable-next-line react/set-state-in-effect -- load() sets state after an await, not synchronously
    void load()
  }, [])

  async function handleLogin(username: string, password: string) {
    const loggedInUser = await login(username, password)
    setUser(loggedInUser)
  }

  async function handleLogout() {
    await logout()
    setUser(null)
  }

  return (
    <>
      <NavBar user={user} onLogout={handleLogout} />
      <main>
        {loaded && !user && <LoginForm onLogin={handleLogin} />}
        {user && <ApplicationsView onUnauthorized={() => setUser(null)} />}
      </main>
    </>
  )
}

export default App
