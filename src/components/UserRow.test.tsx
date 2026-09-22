import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { UserRow } from './UserRow'
import type { User } from '../types'

const testUser: User = { id: 1, username: 'testuser', role: 'basic' }

function renderRow(props: Partial<Parameters<typeof UserRow>[0]> = {}) {
  render(
    <UserRow
      user={testUser}
      onSetRole={vi.fn()}
      onResetPassword={vi.fn()}
      onDelete={vi.fn()}
      {...props}
    />,
  )
}

test('shows the username and its current role', () => {
  renderRow()

  expect(screen.getByText('testuser')).toBeVisible()
  expect(screen.getByRole('combobox', { name: 'Role for testuser' })).toHaveValue('basic')
})

test('changing the role calls onSetRole', async () => {
  const user = userEvent.setup()
  const onSetRole = vi.fn()
  renderRow({ onSetRole })

  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Role for testuser' }),
    'admin',
  )

  expect(onSetRole).toHaveBeenCalledWith('admin')
})

test('deleting takes two clicks', async () => {
  const user = userEvent.setup()
  const onDelete = vi.fn()
  renderRow({ onDelete })

  await user.click(screen.getByRole('button', { name: 'Delete' }))
  expect(onDelete).not.toHaveBeenCalled()

  await user.click(screen.getByRole('button', { name: 'Confirm delete' }))
  expect(onDelete).toHaveBeenCalled()
})

test('cancelling the delete puts the row back', async () => {
  const user = userEvent.setup()
  const onDelete = vi.fn()
  renderRow({ onDelete })

  await user.click(screen.getByRole('button', { name: 'Delete' }))
  await user.click(screen.getByRole('button', { name: 'Cancel' }))

  expect(onDelete).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Delete' })).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Confirm delete' }),
  ).not.toBeInTheDocument()
})

test('resetting a password reveals an input and submits it', async () => {
  const user = userEvent.setup()
  const onResetPassword = vi.fn()
  renderRow({ onResetPassword })

  await user.click(screen.getByRole('button', { name: 'Reset password' }))
  await user.type(
    screen.getByLabelText('New password for testuser'),
    'fresh-password',
  )
  await user.click(screen.getByRole('button', { name: 'Save' }))

  expect(onResetPassword).toHaveBeenCalledWith('fresh-password')
  expect(screen.getByRole('button', { name: 'Reset password' })).toBeVisible()
})
