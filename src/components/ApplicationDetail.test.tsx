import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import type { ComponentProps } from 'react'
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
      uploadedAt: '2026-01-15 09:00:00',
      profileSyncPending: false,
      editedFromId: null,
    },
  ],
}

type DetailProps = ComponentProps<typeof ApplicationDetail>

function drafting(overrides: Partial<DetailProps['drafting']> = {}): DetailProps['drafting'] {
  return { questions: [], onLoadAttachmentText: vi.fn(), onSaveAttachmentText: vi.fn(), ...overrides }
}

function renderDetail(overrides: Partial<DetailProps> = {}) {
  return render(
    <ApplicationDetail
      application={application}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onUploadAttachment={vi.fn()}
      onSetProfileSync={vi.fn()}
      onRemoveAttachment={vi.fn()}
      onSetArchived={vi.fn()}
      drafting={drafting()}
      {...overrides}
    />,
  )
}

test('buttons appear in order: Add to profile, Remove file, Save, Archive, Delete application', () => {
  renderDetail()

  const buttons = screen.getAllByRole('button').map((button) => button.textContent)
  expect(buttons).toEqual([
    'Add to profile',
    'Remove file',
    'Save',
    'Archive',
    'Delete application',
  ])
})

test('Save, Archive and Delete share a parent element', () => {
  renderDetail()

  const save = screen.getByRole('button', { name: 'Save' })
  const archive = screen.getByRole('button', { name: 'Archive' })
  const remove = screen.getByRole('button', { name: 'Delete application' })
  expect(archive.parentElement).toBe(save.parentElement)
  expect(remove.parentElement).toBe(save.parentElement)
})

test('the file picker is present and labelled', () => {
  renderDetail()

  expect(screen.getByLabelText('Attach a file')).toBeInTheDocument()
})

test('renders both timestamps read-only with no input for either', () => {
  renderDetail()

  expect(screen.getByText('Created 15 Jan 2026, 09:00')).toBeVisible()
  expect(screen.getByText('Updated 16 Jan 2026, 10:30')).toBeVisible()
  expect(screen.queryByLabelText(/created/i)).not.toBeInTheDocument()
  expect(screen.queryByLabelText(/updated/i)).not.toBeInTheDocument()
})

test('clicking Archive reports the opposite of the archived flag', async () => {
  const user = userEvent.setup()
  const onSetArchived = vi.fn()
  renderDetail({ onSetArchived })

  await user.click(screen.getByRole('button', { name: 'Archive' }))
  expect(onSetArchived).toHaveBeenCalledWith(true)
})

test('an archived application offers Unarchive', async () => {
  const user = userEvent.setup()
  const onSetArchived = vi.fn()
  renderDetail({ application: { ...application, archived: true }, onSetArchived })

  await user.click(screen.getByRole('button', { name: 'Unarchive' }))
  expect(onSetArchived).toHaveBeenCalledWith(false)
})

test('open questions show above the attachments', () => {
  renderDetail({ drafting: drafting({ questions: [{ id: 'q1', text: 'Why Acme?' }] }) })

  const region = screen.getByRole('region', { name: 'Open questions' })
  const attachment = screen.getByRole('link', { name: 'resume.pdf' })
  expect(region.compareDocumentPosition(attachment) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('no open questions, no questions block', () => {
  renderDetail()

  expect(screen.queryByRole('region', { name: 'Open questions' })).toBeNull()
})
