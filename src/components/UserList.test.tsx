import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { UserList } from './UserList'
import type { User } from '../types'

const users: User[] = [
  { id: 1, username: 'admin-user', role: 'admin' },
  { id: 2, username: 'basic-user', role: 'basic' },
]

function renderList(props: Partial<Parameters<typeof UserList>[0]> = {}) {
  render(
    <UserList
      users={users}
      onSetRole={vi.fn()}
      onResetPassword={vi.fn()}
      onDelete={vi.fn()}
      {...props}
    />,
  )
}

test('renders a row for each user', () => {
  renderList()

  expect(screen.getByText('admin-user')).toBeVisible()
  expect(screen.getByText('basic-user')).toBeVisible()
})

test('renders an empty state with no users', () => {
  renderList({ users: [] })

  expect(screen.getByText('No users to show')).toBeVisible()
})

test('passes the id of the row that acted', async () => {
  const user = userEvent.setup()
  const onSetRole = vi.fn()
  renderList({ onSetRole })

  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Role for basic-user' }),
    'admin',
  )

  expect(onSetRole).toHaveBeenCalledWith(2, 'admin')
})
