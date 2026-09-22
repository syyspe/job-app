import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { UserForm } from './UserForm'

test('submits the username, password and role, then clears the form', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn()
  render(<UserForm onSubmit={onSubmit} />)

  await user.type(screen.getByRole('textbox', { name: 'Username' }), 'new-user')
  await user.type(screen.getByLabelText('Password'), 'new-password')
  await user.click(screen.getByRole('button', { name: 'Add user' }))

  expect(onSubmit).toHaveBeenCalledWith({
    username: 'new-user',
    password: 'new-password',
    role: 'basic',
  })
  expect(screen.getByRole('textbox', { name: 'Username' })).toHaveValue('')
  expect(screen.getByLabelText('Password')).toHaveValue('')
})

test('submits the chosen role', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn()
  render(<UserForm onSubmit={onSubmit} />)

  await user.type(screen.getByRole('textbox', { name: 'Username' }), 'new-admin')
  await user.type(screen.getByLabelText('Password'), 'new-password')
  await user.selectOptions(screen.getByRole('combobox', { name: 'Role' }), 'admin')
  await user.click(screen.getByRole('button', { name: 'Add user' }))

  expect(onSubmit).toHaveBeenCalledWith({
    username: 'new-admin',
    password: 'new-password',
    role: 'admin',
  })
})
