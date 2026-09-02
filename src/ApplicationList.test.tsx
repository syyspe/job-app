import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { ApplicationList } from './ApplicationList'
import type { Application } from './types'

const applications: Application[] = [
  {
    id: 1,
    company: 'Acme',
    role: 'Engineer',
    dateApplied: '2026-01-15',
    status: 'applied',
    link: '',
    notes: '',
    attachments: [],
  },
  {
    id: 2,
    company: 'Globex',
    role: 'Designer',
    dateApplied: '2026-02-01',
    status: 'interview',
    link: '',
    notes: '',
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
    />,
  )

  expect(screen.getByRole('button', { name: /Acme/ })).toBeVisible()
  expect(screen.getByRole('button', { name: /Globex/ })).toBeVisible()
})

test('the collapsed list shows no detail panel', () => {
  render(
    <ApplicationList
      applications={applications}
      expandedId={null}
      onToggle={vi.fn()}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
    />,
  )

  expect(
    screen.queryByRole('button', { name: 'Delete' }),
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
    />,
  )

  expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1)
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  expect(onDelete).toHaveBeenCalledWith(1)
})
