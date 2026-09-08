import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { LoginForm } from './LoginForm'

test('submitting calls onLogin with both values', async () => {
  const user = userEvent.setup()
  const onLogin = vi.fn().mockResolvedValue(undefined)
  render(<LoginForm onLogin={onLogin} />)

  await user.type(screen.getByRole('textbox', { name: 'Username' }), 'testuser')
  await user.type(screen.getByLabelText('Password'), 'test-password')
  await user.click(screen.getByRole('button', { name: 'Log in' }))

  expect(onLogin).toHaveBeenCalledWith('testuser', 'test-password')
})

