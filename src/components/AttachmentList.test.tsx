import { render, screen } from '@testing-library/react'
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
  },
  {
    id: 2,
    applicationId: 1,
    storedName: 'a2.txt',
    originalName: 'cover-letter.txt',
    mimeType: 'text/plain',
  },
]

test('renders a link for each attachment', () => {
  render(
    <AttachmentList
      attachments={attachments}
      onUpload={vi.fn()}
      onRemove={vi.fn()}
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
      onRemove={onRemove}
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
      onRemove={vi.fn()}
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
      onRemove={vi.fn()}
    />,
  )

  const file = new File(['contents'], 'photo.png', { type: 'image/png' })
  const input = screen.getByLabelText('Attach a file')
  await user.upload(input, file)

  expect(input).toHaveValue('')
})
