import { useCallback, useEffect, useState } from 'react'
import { UserForm } from './UserForm.tsx'
import { UserList } from './UserList.tsx'
import {
  UnauthorizedError,
  createUser,
  deleteUser,
  listUsers,
  resetUserPassword,
  setUserRole,
} from '../lib/api.ts'
import { useToast } from '../lib/toast.ts'
import type { Role, User, UserInput } from '../types.ts'

function useUsers(onUnauthorized: () => void) {
  const [users, setUsers] = useState<User[]>([])
  const { showSuccess, showError } = useToast()

  const run = useCallback(
    async (task: () => Promise<void>, successMessage?: string) => {
      try {
        await task()
        if (successMessage) showSuccess(successMessage)
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          showError('Your session expired — please log in again')
          onUnauthorized()
          return
        }
        showError(error instanceof Error ? error.message : 'Something went wrong')
      }
    },
    [onUnauthorized, showSuccess, showError],
  )

  async function reload() {
    setUsers(await listUsers())
  }

  useEffect(() => {
    void run(reload)
  }, [run])

  async function handleCreate(input: UserInput) {
    await run(async () => {
      await createUser(input)
      await reload()
    }, 'User added')
  }

  async function handleSetRole(id: number, role: Role) {
    await run(async () => {
      await setUserRole(id, role)
      await reload()
    }, 'Role changed')
  }

  async function handleResetPassword(id: number, password: string) {
    await run(async () => {
      await resetUserPassword(id, password)
    }, 'Password reset')
  }

  async function handleDelete(id: number) {
    await run(async () => {
      await deleteUser(id)
      await reload()
    }, 'User deleted')
  }

  return { users, handleCreate, handleSetRole, handleResetPassword, handleDelete }
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
