import { useEffect, useState } from 'react'
import { ApplicationsView } from './components/ApplicationsView.tsx'
import { LoginForm } from './components/LoginForm.tsx'
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
    <main>
      <h1>Job applications</h1>
      {loaded && !user && <LoginForm onLogin={handleLogin} />}
      {user && (
        <>
          <div className="session-bar">
            <span>{user.username}</span>
            <button type="button" className="button" onClick={handleLogout}>
              Log out
            </button>
          </div>
          <ApplicationsView onUnauthorized={() => setUser(null)} />
        </>
      )}
    </main>
  )
}

export default App
