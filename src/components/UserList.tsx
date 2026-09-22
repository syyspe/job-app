import { UserRow } from './UserRow.tsx'
import type { Role, User } from '../types.ts'

function EmptyState() {
  return (
    <div className="empty-state">
      <p className="empty-state-title">No users to show</p>
      <p>Add one with the form.</p>
    </div>
  )
}

interface UserListProps {
  users: User[]
  onSetRole: (id: number, role: Role) => void
  onResetPassword: (id: number, password: string) => void
  onDelete: (id: number) => void
}

export function UserList({ users, onSetRole, onResetPassword, onDelete }: UserListProps) {
  if (users.length === 0) {
    return <EmptyState />
  }

  return (
    <ul className="user-list">
      {users.map((user) => (
        <UserRow
          key={user.id}
          user={user}
          onSetRole={(role) => onSetRole(user.id, role)}
          onResetPassword={(password) => onResetPassword(user.id, password)}
          onDelete={() => onDelete(user.id)}
        />
      ))}
    </ul>
  )
}
