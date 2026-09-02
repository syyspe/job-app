import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { ApplicationForm } from './ApplicationForm'

test('fills the form and calls onSubmit with the entered values', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn()
  render(<ApplicationForm submitLabel="Add application" onSubmit={onSubmit} />)

  await user.type(screen.getByRole('textbox', { name: 'Company' }), 'Acme')
  await user.type(screen.getByRole('textbox', { name: 'Role' }), 'Engineer')
  fireEvent.change(screen.getByLabelText('Date applied'), {
    target: { value: '2026-01-15' },
  })
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Status' }),
    'interview',
  )
  await user.type(
    screen.getByRole('textbox', { name: 'Link' }),
    'https://acme.example/jobs/1',
  )
  await user.type(
    screen.getByRole('textbox', { name: 'Notes' }),
    'Referred by a friend',
  )
  await user.click(screen.getByRole('button', { name: 'Add application' }))

  expect(onSubmit).toHaveBeenCalledWith({
    company: 'Acme',
    role: 'Engineer',
    dateApplied: '2026-01-15',
    status: 'interview',
    link: 'https://acme.example/jobs/1',
    notes: 'Referred by a friend',
  })
})
