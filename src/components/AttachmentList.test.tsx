import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { AttachmentList } from './AttachmentList'
import type { Attachment } from '../types'

const attachments: Attachment[] = [
  {
    id: 1,
    applicationId: 1,
    storedName: 'a1.txt',
    originalName: 'resume.txt',
    mimeType: 'text/plain',
    uploadedAt: '2026-01-15 09:00:00',
    profileSyncPending: false,
    editedFromId: null,
  },
  {
    id: 2,
    applicationId: 1,
    storedName: 'a2.txt',
    originalName: 'cover-letter.txt',
    mimeType: 'text/plain',
    uploadedAt: '2026-01-15 09:00:00',
    profileSyncPending: true,
    editedFromId: null,
  },
]

test('renders a link for each attachment', () => {
  render(
    <AttachmentList
      attachments={attachments}
      onUpload={vi.fn()}
      onSetProfileSync={vi.fn()}
      onRemove={vi.fn()}
      editing={{ onLoadText: vi.fn(), onSaveText: vi.fn() }}
    />,
  )

  expect(screen.getByRole('link', { name: 'resume.txt' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'cover-letter.txt' })).toBeVisible()
})

test('removing an attachment reports its id', async () => {
  const user = userEvent.setup()
  const onRemove = vi.fn()
  render(
    <AttachmentList
      attachments={attachments}
      onUpload={vi.fn()}
      onSetProfileSync={vi.fn()}
      onRemove={onRemove}
      editing={{ onLoadText: vi.fn(), onSaveText: vi.fn() }}
    />,
  )

  const removeButtons = screen.getAllByRole('button', { name: 'Remove file' })
  await user.click(removeButtons[1])

  expect(onRemove).toHaveBeenCalledWith(2)
})

test('choosing a file reports the file', async () => {
  const user = userEvent.setup()
  const onUpload = vi.fn()
  render(
    <AttachmentList
      attachments={attachments}
      onUpload={onUpload}
      onSetProfileSync={vi.fn()}
      onRemove={vi.fn()}
      editing={{ onLoadText: vi.fn(), onSaveText: vi.fn() }}
    />,
  )

  const file = new File(['contents'], 'photo.png', { type: 'image/png' })
  await user.upload(screen.getByLabelText('Attach a file'), file)

  expect(onUpload).toHaveBeenCalledOnce()
  expect(onUpload).toHaveBeenCalledWith(file)
})

test('the input is cleared after an upload', async () => {
  const user = userEvent.setup()
  render(
    <AttachmentList
      attachments={attachments}
      onUpload={vi.fn()}
      onSetProfileSync={vi.fn()}
      onRemove={vi.fn()}
      editing={{ onLoadText: vi.fn(), onSaveText: vi.fn() }}
    />,
  )

  const file = new File(['contents'], 'photo.png', { type: 'image/png' })
  const input = screen.getByLabelText('Attach a file')
  await user.upload(input, file)

  expect(input).toHaveValue('')
})

test('a change with no file reports nothing', () => {
  const onUpload = vi.fn()
  render(
    <AttachmentList
      attachments={attachments}
      onUpload={onUpload}
      onSetProfileSync={vi.fn()}
      onRemove={vi.fn()}
      editing={{ onLoadText: vi.fn(), onSaveText: vi.fn() }}
    />,
  )

  fireEvent.change(screen.getByLabelText('Attach a file'), {
    target: { files: [] },
  })

  expect(onUpload).not.toHaveBeenCalled()
})

test('an unmarked attachment offers to add it to the profile', async () => {
  const user = userEvent.setup()
  const onSetProfileSync = vi.fn()
  render(
    <AttachmentList
      attachments={attachments}
      onUpload={vi.fn()}
      onSetProfileSync={onSetProfileSync}
      onRemove={vi.fn()}
      editing={{ onLoadText: vi.fn(), onSaveText: vi.fn() }}
    />,
  )

  await user.click(screen.getByRole('button', { name: 'Add resume.txt to profile' }))

  expect(onSetProfileSync).toHaveBeenCalledWith(1, true)
})

test('a marked attachment shows it is pending and offers to take the mark back', async () => {
  const user = userEvent.setup()
  const onSetProfileSync = vi.fn()
  render(
    <AttachmentList
      attachments={attachments}
      onUpload={vi.fn()}
      onSetProfileSync={onSetProfileSync}
      onRemove={vi.fn()}
      editing={{ onLoadText: vi.fn(), onSaveText: vi.fn() }}
    />,
  )

  expect(screen.getAllByText('Pending profile sync')).toHaveLength(1)
  expect(screen.queryByRole('button', { name: 'Add cover-letter.txt to profile' })).toBeNull()
  await user.click(
    screen.getByRole('button', { name: "Don't add cover-letter.txt to profile" }),
  )

  expect(onSetProfileSync).toHaveBeenCalledWith(2, false)
})

const letter: Attachment = { ...attachments[0], id: 3, storedName: 'a3.md', originalName: 'Letter.md' }
const letterCopy: Attachment = {
  ...letter,
  id: 4,
  storedName: 'a4.md',
  originalName: 'Letter (edited).md',
  editedFromId: 3,
}
const cv: Attachment = { ...attachments[0], id: 5, storedName: 'a5.MD', originalName: 'CV.MD' }

function renderEditable(handlers: { onLoadText?: () => Promise<string | null>; onSaveText?: () => Promise<boolean> } = {}) {
  render(
    <AttachmentList
      attachments={[attachments[0], letter, letterCopy, cv]}
      onUpload={vi.fn()}
      onSetProfileSync={vi.fn()}
      onRemove={vi.fn()}
      editing={{
        onLoadText: handlers.onLoadText ?? vi.fn(async () => 'text'),
        onSaveText: handlers.onSaveText ?? vi.fn(async () => true),
      }}
    />,
  )
}

test('Edit is offered on current .md attachments only', () => {
  renderEditable()

  expect(screen.getByRole('button', { name: 'Edit Letter (edited).md' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Edit CV.MD' })).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Edit Letter.md' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Edit resume.txt' })).toBeNull()
})

test('a superseded original says it is kept and still offers profile and remove', () => {
  renderEditable()

  expect(screen.getByText('Original, kept unchanged')).toBeVisible()
  expect(screen.getByRole('link', { name: 'Letter.md' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Add Letter.md to profile' })).toBeVisible()
})

test('Edit loads the text into the editor, and a successful save closes it', async () => {
  const user = userEvent.setup()
  const onLoadText = vi.fn(async () => 'Hei')
  const onSaveText = vi.fn(async () => true)
  renderEditable({ onLoadText, onSaveText })

  await user.click(screen.getByRole('button', { name: 'Edit CV.MD' }))
  const field = screen.getByRole('textbox', { name: 'Edit CV.MD' })
  expect(field).toHaveValue('Hei')
  await user.type(field, '!')
  await user.click(screen.getByRole('button', { name: 'Save CV.MD' }))

  expect(onLoadText).toHaveBeenCalledWith(5)
  expect(onSaveText).toHaveBeenCalledWith(5, 'Hei!')
  expect(screen.queryByRole('textbox', { name: 'Edit CV.MD' })).toBeNull()
})

test('a failed save keeps the editor open with the text', async () => {
  const user = userEvent.setup()
  renderEditable({ onSaveText: vi.fn(async () => false) })

  await user.click(screen.getByRole('button', { name: 'Edit CV.MD' }))
  await user.click(screen.getByRole('button', { name: 'Save CV.MD' }))

  expect(screen.getByRole('textbox', { name: 'Edit CV.MD' })).toHaveValue('text')
})

test('a failed load opens no editor', async () => {
  const user = userEvent.setup()
  renderEditable({ onLoadText: vi.fn(async () => null) })

  await user.click(screen.getByRole('button', { name: 'Edit CV.MD' }))

  expect(screen.queryByRole('textbox')).toBeNull()
})
