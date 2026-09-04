import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { NavBar } from './NavBar'

test('renders the heading with no user', () => {
  render(<NavBar user={null} onLogout={vi.fn()} />)

  expect(
    screen.getByRole('heading', { name: 'Job applications' }),
  ).toBeInTheDocument()
})

test('does not render username or logout button with no user', () => {
  render(<NavBar user={null} onLogout={vi.fn()} />)

  expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument()
})

test('renders username and logout button, and calls onLogout when clicked', async () => {
  const user = userEvent.setup()
  const onLogout = vi.fn().mockResolvedValue(undefined)
  render(<NavBar user={{ id: 1, username: 'testuser' }} onLogout={onLogout} />)

  expect(screen.getByText('testuser')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Log out' }))

  expect(onLogout).toHaveBeenCalled()
})
