import { useEffect, useState } from 'react'
import { UserForm } from './UserForm.tsx'
import { UserList } from './UserList.tsx'
import {
  createUser,
  deleteUser,
  listUsers,
  resetUserPassword,
  setUserRole,
} from '../lib/api.ts'
import { useApiAction } from '../lib/apiAction.ts'
import type { Role, User, UserInput } from '../types.ts'

function useUsers(onUnauthorized: () => void) {
  const [users, setUsers] = useState<User[]>([])
  const run = useApiAction(onUnauthorized)

  async function reload() {
    setUsers(await listUsers())
  }

  useEffect(() => {
    void run(reload)
  }, [run])

  async function change(call: () => Promise<unknown>, message: string) {
    await run(async () => {
      await call()
      await reload()
    }, message)
  }

  async function handleResetPassword(id: number, password: string) {
    await run(async () => {
      await resetUserPassword(id, password)
    }, 'Password reset')
  }

  return {
    users,
    handleCreate: (input: UserInput) => change(() => createUser(input), 'User added'),
    handleSetRole: (id: number, role: Role) =>
      change(() => setUserRole(id, role), 'Role changed'),
    handleResetPassword,
    handleDelete: (id: number) => change(() => deleteUser(id), 'User deleted'),
  }
}

interface AdminViewProps {
  onUnauthorized: () => void
}

export function AdminView({ onUnauthorized }: AdminViewProps) {
  const { users, handleCreate, handleSetRole, handleResetPassword, handleDelete } =
    useUsers(onUnauthorized)

  return (
    <div className="layout">
      <section className="panel">
        <h2>Add a user</h2>
        <UserForm onSubmit={handleCreate} />
      </section>
      <div>
        <UserList
          users={users}
          onSetRole={handleSetRole}
          onResetPassword={handleResetPassword}
          onDelete={handleDelete}
        />
      </div>
    </div>
  )
}
