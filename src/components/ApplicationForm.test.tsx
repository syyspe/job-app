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
  fireEvent.change(screen.getByLabelText('Deadline'), {
    target: { value: '2026-02-01' },
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
    deadline: '2026-02-01',
    status: 'interview',
    link: 'https://acme.example/jobs/1',
    notes: 'Referred by a friend',
  })
})

test('clears the add form after submit', async () => {
  const user = userEvent.setup()
  render(<ApplicationForm submitLabel="Add application" onSubmit={vi.fn()} />)

  await user.type(screen.getByRole('textbox', { name: 'Company' }), 'Acme')
  await user.type(screen.getByRole('textbox', { name: 'Role' }), 'Engineer')
  await user.type(
    screen.getByRole('textbox', { name: 'Link' }),
    'https://acme.example/jobs/1',
  )
  await user.type(
    screen.getByRole('textbox', { name: 'Notes' }),
    'Referred by a friend',
  )
  await user.click(screen.getByRole('button', { name: 'Add application' }))

  expect(screen.getByRole('textbox', { name: 'Company' })).toHaveValue('')
  expect(screen.getByRole('textbox', { name: 'Role' })).toHaveValue('')
  expect(screen.getByRole('textbox', { name: 'Link' })).toHaveValue('')
  expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue('')
  expect(screen.getByLabelText('Date applied')).toHaveValue('')
  expect(screen.getByLabelText('Deadline')).toHaveValue('')
  expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('draft')
})

test('keeps the edit form values after save', async () => {
  const user = userEvent.setup()
  const initial = {
    company: 'Acme',
    role: 'Engineer',
    dateApplied: '2026-01-15',
    deadline: '2026-02-01',
    status: 'interview' as const,
    link: 'https://acme.example/jobs/1',
    notes: 'Referred by a friend',
  }
  render(
    <ApplicationForm initial={initial} submitLabel="Save" onSubmit={vi.fn()} />,
  )

  await user.click(screen.getByRole('button', { name: 'Save' }))

  expect(screen.getByRole('textbox', { name: 'Company' })).toHaveValue('Acme')
  expect(screen.getByRole('textbox', { name: 'Role' })).toHaveValue('Engineer')
  expect(screen.getByLabelText('Date applied')).toHaveValue('2026-01-15')
  expect(screen.getByLabelText('Deadline')).toHaveValue('2026-02-01')
  expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue(
    'interview',
  )
})

test('keeps in-progress edits when the parent rerenders', async () => {
  const user = userEvent.setup()
  const initial = {
    company: 'Acme',
    role: 'Engineer',
    dateApplied: '2026-01-15',
    deadline: '',
    status: 'interview' as const,
    link: '',
    notes: '',
  }
  const { rerender } = render(
    <ApplicationForm initial={initial} submitLabel="Save" onSubmit={vi.fn()} />,
  )

  await user.clear(screen.getByRole('textbox', { name: 'Role' }))
  await user.type(screen.getByRole('textbox', { name: 'Role' }), 'Staff Engineer')
  rerender(
    <ApplicationForm initial={{ ...initial }} submitLabel="Save" onSubmit={vi.fn()} />,
  )

  expect(screen.getByRole('textbox', { name: 'Role' })).toHaveValue('Staff Engineer')
})

test('setting a date on a draft switches its status to applied', () => {
  const onSubmit = vi.fn()
  render(<ApplicationForm submitLabel="Add application" onSubmit={onSubmit} />)

  fireEvent.change(screen.getByLabelText('Date applied'), {
    target: { value: '2026-01-15' },
  })

  expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue(
    'applied',
  )
})

test('changing the date on a non-draft leaves its status alone', () => {
  const onSubmit = vi.fn()
  const initial = {
    company: 'Acme',
    role: 'Engineer',
    dateApplied: '2026-01-15',
    deadline: '',
    status: 'interview' as const,
    link: '',
    notes: '',
  }
  render(
    <ApplicationForm initial={initial} submitLabel="Save" onSubmit={onSubmit} />,
  )

  fireEvent.change(screen.getByLabelText('Date applied'), {
    target: { value: '2026-01-20' },
  })

  expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue(
    'interview',
  )
})

test('the date input is required unless the status is draft', async () => {
  const user = userEvent.setup()
  render(<ApplicationForm submitLabel="Add application" onSubmit={vi.fn()} />)

  expect(screen.getByLabelText('Date applied')).not.toBeRequired()

  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Status' }),
    'interview',
  )

  expect(screen.getByLabelText('Date applied')).toBeRequired()
})

test('the deadline is never required, regardless of status', async () => {
  const user = userEvent.setup()
  render(<ApplicationForm submitLabel="Add application" onSubmit={vi.fn()} />)

  expect(screen.getByLabelText('Deadline')).not.toBeRequired()

  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Status' }),
    'interview',
  )

  expect(screen.getByLabelText('Deadline')).not.toBeRequired()
})
