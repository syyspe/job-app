import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { ApplicationList } from './ApplicationList'
import type { Application } from '../types'

const applications: Application[] = [
  {
    id: 1,
    company: 'Acme',
    role: 'Engineer',
    dateApplied: '2026-01-15',
    deadline: '',
    status: 'applied',
    link: '',
    notes: '',
    createdAt: '2026-01-15 09:00:00',
    updatedAt: '2026-01-15 09:00:00',
    attachments: [],
  },
  {
    id: 2,
    company: 'Globex',
    role: 'Designer',
    dateApplied: '2026-02-01',
    deadline: '2026-03-01',
    status: 'interview',
    link: '',
    notes: '',
    createdAt: '2026-02-01 09:00:00',
    updatedAt: '2026-02-01 09:00:00',
    attachments: [],
  },
]

test('renders a row for each application', () => {
  render(
    <ApplicationList
      applications={applications}
      expandedId={null}
      onToggle={vi.fn()}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onUploadAttachment={vi.fn()}
      onRemoveAttachment={vi.fn()}
    />,
  )

  expect(screen.getByRole('button', { name: /Acme/ })).toBeVisible()
  expect(screen.getByRole('button', { name: /Globex/ })).toBeVisible()
})

test('shows a due date suffix only when the application has a deadline', () => {
  render(
    <ApplicationList
      applications={applications}
      expandedId={null}
      onToggle={vi.fn()}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onUploadAttachment={vi.fn()}
      onRemoveAttachment={vi.fn()}
    />,
  )

  expect(
    screen.getByRole('button', { name: /Globex.*due 2026-03-01/ }),
  ).toBeVisible()
  expect(screen.getByRole('button', { name: /^Acme/ }).textContent).not.toMatch(/due/)
})

test('the collapsed list shows no detail panel', () => {
  render(
    <ApplicationList
      applications={applications}
      expandedId={null}
      onToggle={vi.fn()}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onUploadAttachment={vi.fn()}
      onRemoveAttachment={vi.fn()}
    />,
  )

  expect(
    screen.queryByRole('button', { name: 'Delete application' }),
  ).not.toBeInTheDocument()
})

test('the expanded row shows its detail panel and reports a delete', async () => {
  const user = userEvent.setup()
  const onDelete = vi.fn()
  render(
    <ApplicationList
      applications={applications}
      expandedId={1}
      onToggle={vi.fn()}
      onUpdate={vi.fn()}
      onDelete={onDelete}
      onUploadAttachment={vi.fn()}
      onRemoveAttachment={vi.fn()}
    />,
  )

  expect(
    screen.getAllByRole('button', { name: 'Delete application' }),
  ).toHaveLength(1)
  await user.click(screen.getByRole('button', { name: 'Delete application' }))
  expect(onDelete).toHaveBeenCalledWith(1)
})
