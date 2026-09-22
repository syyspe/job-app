import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { ApplicationDetail } from './ApplicationDetail'
import type { Application } from '../types'

const application: Application = {
  id: 1,
  company: 'Acme',
  role: 'Engineer',
  dateApplied: '2026-01-15',
  deadline: '2026-02-01',
  status: 'applied',
  link: '',
  notes: '',
  archived: false,
  createdAt: '2026-01-15 09:00:00',
  updatedAt: '2026-01-16 10:30:00',
  attachments: [
    {
      id: 1,
      applicationId: 1,
      storedName: 'resume.pdf',
      originalName: 'resume.pdf',
      mimeType: 'application/pdf',
    },
  ],
}

test('buttons appear in order: Remove file, Save, Archive, Delete application', () => {
  render(
    <ApplicationDetail
      application={application}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onUploadAttachment={vi.fn()}
      onRemoveAttachment={vi.fn()}
      onSetArchived={vi.fn()}
    />,
  )

  const buttons = screen.getAllByRole('button').map((button) => button.textContent)
  expect(buttons).toEqual([
    'Remove file',
    'Save',
    'Archive',
    'Delete application',
  ])
})

test('Save and Delete share a parent element', () => {
  render(
    <ApplicationDetail
      application={application}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onUploadAttachment={vi.fn()}
      onRemoveAttachment={vi.fn()}
      onSetArchived={vi.fn()}
    />,
  )

  const save = screen.getByRole('button', { name: 'Save' })
  const remove = screen.getByRole('button', { name: 'Delete application' })
  expect(save.parentElement).toBe(remove.parentElement)
})

test('the file picker is present and labelled', () => {
  render(
    <ApplicationDetail
      application={application}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onUploadAttachment={vi.fn()}
      onRemoveAttachment={vi.fn()}
      onSetArchived={vi.fn()}
    />,
  )

  expect(screen.getByLabelText('Attach a file')).toBeInTheDocument()
})

test('renders both timestamps read-only with no input for either', () => {
  render(
    <ApplicationDetail
      application={application}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onUploadAttachment={vi.fn()}
      onRemoveAttachment={vi.fn()}
      onSetArchived={vi.fn()}
    />,
  )

  expect(screen.getByText('Created 15 Jan 2026, 09:00')).toBeVisible()
  expect(screen.getByText('Updated 16 Jan 2026, 10:30')).toBeVisible()
  expect(screen.queryByLabelText(/created/i)).not.toBeInTheDocument()
  expect(screen.queryByLabelText(/updated/i)).not.toBeInTheDocument()
})

test('clicking Archive reports the opposite of the archived flag', async () => {
  const user = userEvent.setup()
  const onSetArchived = vi.fn()
  render(
    <ApplicationDetail
      application={application}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onUploadAttachment={vi.fn()}
      onRemoveAttachment={vi.fn()}
      onSetArchived={onSetArchived}
    />,
  )

  await user.click(screen.getByRole('button', { name: 'Archive' }))
  expect(onSetArchived).toHaveBeenCalledWith(true)
})

test('an archived application offers Unarchive', async () => {
  const user = userEvent.setup()
  const onSetArchived = vi.fn()
  render(
    <ApplicationDetail
      application={{ ...application, archived: true }}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onUploadAttachment={vi.fn()}
      onRemoveAttachment={vi.fn()}
      onSetArchived={onSetArchived}
    />,
  )

  await user.click(screen.getByRole('button', { name: 'Unarchive' }))
  expect(onSetArchived).toHaveBeenCalledWith(false)
})
