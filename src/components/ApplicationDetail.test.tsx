import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { ApplicationDetail } from './ApplicationDetail'
import type { Application } from '../types'

const application: Application = {
  id: 1,
  company: 'Acme',
  role: 'Engineer',
  dateApplied: '2026-01-15',
  status: 'applied',
  link: '',
  notes: '',
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

test('buttons appear in order: Remove file, Save, Delete application', () => {
  render(
    <ApplicationDetail
      application={application}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onUploadAttachment={vi.fn()}
      onRemoveAttachment={vi.fn()}
    />,
  )

  const buttons = screen.getAllByRole('button').map((button) => button.textContent)
  expect(buttons).toEqual(['Remove file', 'Save', 'Delete application'])
})

test('Save and Delete share a parent element', () => {
  render(
    <ApplicationDetail
      application={application}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onUploadAttachment={vi.fn()}
      onRemoveAttachment={vi.fn()}
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
    />,
  )

  expect(screen.getByLabelText('Attach a file')).toBeInTheDocument()
})
