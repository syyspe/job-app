import { render, screen, within } from '@testing-library/react'
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
    archived: false,
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
    archived: false,
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
      onSetArchived={vi.fn()}
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
      onSetArchived={vi.fn()}
    />,
  )

  expect(
    screen.getByRole('button', { name: /Globex.*due 1 Mar 2026/ }),
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
      onSetArchived={vi.fn()}
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
      onSetArchived={vi.fn()}
    />,
  )

  expect(
    screen.getAllByRole('button', { name: 'Delete application' }),
  ).toHaveLength(1)
  await user.click(screen.getByRole('button', { name: 'Delete application' }))
  expect(onDelete).toHaveBeenCalledWith(1)
})

test('each row reports whether it is expanded', () => {
  render(
    <ApplicationList
      applications={applications}
      expandedId={1}
      onToggle={vi.fn()}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onUploadAttachment={vi.fn()}
      onRemoveAttachment={vi.fn()}
      onSetArchived={vi.fn()}
    />,
  )

  expect(screen.getByRole('button', { name: /^Acme/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  expect(screen.getByRole('button', { name: /Globex/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
})

test('the empty state names the app and points at the form', () => {
  render(
    <ApplicationList
      applications={[]}
      expandedId={null}
      onToggle={vi.fn()}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onUploadAttachment={vi.fn()}
      onRemoveAttachment={vi.fn()}
      onSetArchived={vi.fn()}
    />,
  )

  expect(screen.getByText('Nothing tracked yet')).toBeVisible()
  expect(
    screen.getByText('Add your first application with the form.'),
  ).toBeVisible()
})

const withArchived: Application[] = [
  applications[0],
  { ...applications[1], archived: true },
]

// Only the expanded row renders an archive control, and expandedId holds a
// single id, so reaching both rows' controls means a rerender.
function expandedList(expandedId: number, onSetArchived = vi.fn()) {
  return (
    <ApplicationList
      applications={withArchived}
      expandedId={expandedId}
      onToggle={vi.fn()}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onUploadAttachment={vi.fn()}
      onRemoveAttachment={vi.fn()}
      onSetArchived={onSetArchived}
    />
  )
}

test('an expanded row offers Archive, an expanded archived row Unarchive', () => {
  const { rerender } = render(expandedList(1))

  const [active] = screen.getAllByRole('listitem')
  expect(within(active).getByRole('button', { name: 'Archive' })).toBeVisible()

  rerender(expandedList(2))

  const [, archived] = screen.getAllByRole('listitem')
  expect(within(archived).getByRole('button', { name: 'Unarchive' })).toBeVisible()
})

test('clicking the archive button reports the opposite of the row flag', async () => {
  const user = userEvent.setup()
  const onSetArchived = vi.fn()
  const { rerender } = render(expandedList(1, onSetArchived))

  await user.click(screen.getByRole('button', { name: 'Archive' }))
  expect(onSetArchived).toHaveBeenCalledWith(1, true)

  rerender(expandedList(2, onSetArchived))

  await user.click(screen.getByRole('button', { name: 'Unarchive' }))
  expect(onSetArchived).toHaveBeenCalledWith(2, false)
})

test('an archived row is marked as archived', () => {
  render(
    <ApplicationList
      applications={withArchived}
      expandedId={null}
      onToggle={vi.fn()}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onUploadAttachment={vi.fn()}
      onRemoveAttachment={vi.fn()}
      onSetArchived={vi.fn()}
    />,
  )

  const [active, archived] = screen.getAllByRole('listitem')
  expect(active).toHaveAttribute('data-archived', 'false')
  expect(archived).toHaveAttribute('data-archived', 'true')
})
