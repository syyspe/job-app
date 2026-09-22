import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { NavBar } from './NavBar'
import type { View } from './NavBar'
import type { User } from '../types'

const adminUser: User = { id: 1, username: 'testuser', role: 'admin' }
const basicUser: User = { id: 2, username: 'testuser', role: 'basic' }

function renderNavBar(user: User | null, view: View = 'applications', props = {}) {
  render(
    <NavBar
      user={user}
      view={view}
      onViewChange={vi.fn()}
      onLogout={vi.fn()}
      {...props}
    />,
  )
}

test('renders the heading with no user', () => {
  renderNavBar(null)

  expect(
    screen.getByRole('heading', { name: 'Job applications' }),
  ).toBeInTheDocument()
})

test('does not render username or logout button with no user', () => {
  renderNavBar(null)

  expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument()
  expect(screen.queryByText('testuser')).not.toBeInTheDocument()
})

test('renders username and logout button, and calls onLogout when clicked', async () => {
  const user = userEvent.setup()
  const onLogout = vi.fn().mockResolvedValue(undefined)
  renderNavBar(basicUser, 'applications', { onLogout })

  expect(screen.getByText('testuser')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Log out' }))

  expect(onLogout).toHaveBeenCalled()
})

test('offers the admin view to an admin', async () => {
  const user = userEvent.setup()
  const onViewChange = vi.fn()
  renderNavBar(adminUser, 'applications', { onViewChange })

  await user.click(screen.getByRole('button', { name: 'Admin' }))

  expect(onViewChange).toHaveBeenCalledWith('admin')
})

test('offers the way back while the admin view is showing', async () => {
  const user = userEvent.setup()
  const onViewChange = vi.fn()
  renderNavBar(adminUser, 'admin', { onViewChange })

  await user.click(screen.getByRole('button', { name: 'Applications' }))

  expect(onViewChange).toHaveBeenCalledWith('applications')
})

test('does not offer the admin view to a basic user', () => {
  renderNavBar(basicUser)

  expect(screen.queryByRole('button', { name: 'Admin' })).not.toBeInTheDocument()
})
