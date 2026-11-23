import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { AttachmentEditor } from './AttachmentEditor'
import type { Attachment } from '../types'

const original: Attachment = {
  id: 1,
  applicationId: 1,
  storedName: 'a1.md',
  originalName: 'Hakemus_Acme_FI.md',
  mimeType: 'text/markdown',
  uploadedAt: '2026-01-15 09:00:00',
  profileSyncPending: false,
  editedFromId: null,
}

test('shows the text and saves the edited text', async () => {
  const user = userEvent.setup()
  const onSave = vi.fn()
  render(<AttachmentEditor attachment={original} initialText="Hei" onSave={onSave} onCancel={vi.fn()} />)

  const field = screen.getByRole('textbox', { name: 'Edit Hakemus_Acme_FI.md' })
  expect(field).toHaveValue('Hei')
  await user.type(field, ' maailma')
  await user.click(screen.getByRole('button', { name: 'Save Hakemus_Acme_FI.md' }))

  expect(onSave).toHaveBeenCalledWith('Hei maailma')
})

test('on an original, says the original is kept and names the copy', () => {
  render(<AttachmentEditor attachment={original} initialText="" onSave={vi.fn()} onCancel={vi.fn()} />)

  expect(
    screen.getByText('Saving keeps the original and writes it as Hakemus_Acme_FI (edited).md.'),
  ).toBeVisible()
})

test('on a copy, has no hint', () => {
  const copy = { ...original, id: 2, originalName: 'Hakemus_Acme_FI (edited).md', editedFromId: 1 }
  render(<AttachmentEditor attachment={copy} initialText="" onSave={vi.fn()} onCancel={vi.fn()} />)

  expect(screen.queryByText(/Saving keeps the original/)).toBeNull()
})

test('cancel reports without saving', async () => {
  const user = userEvent.setup()
  const onSave = vi.fn()
  const onCancel = vi.fn()
  render(<AttachmentEditor attachment={original} initialText="" onSave={onSave} onCancel={onCancel} />)

  await user.click(screen.getByRole('button', { name: 'Cancel editing Hakemus_Acme_FI.md' }))

  expect(onCancel).toHaveBeenCalledOnce()
  expect(onSave).not.toHaveBeenCalled()
})
