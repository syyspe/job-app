import type { Role, User } from '../types.ts'

export interface UserRow {
  id: number
  username: string
  password_hash: string
  role: Role
  agent_access: number
  created_at: string
}

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    agentAccess: row.agent_access === 1,
  }
}
