import type { ChangeEvent } from 'react'
import { attachmentUrl } from '../lib/api.ts'
import type { Attachment } from '../types.ts'

interface AttachmentItemProps {
  attachment: Attachment
  onRemove: (id: number) => void
}

function AttachmentItem({ attachment, onRemove }: AttachmentItemProps) {
  return (
    <li className="attachment-item">
      <a href={attachmentUrl(attachment.id)}>{attachment.originalName}</a>
      <button
        type="button"
        className="button button-danger"
        onClick={() => onRemove(attachment.id)}
      >
        Remove file
      </button>
    </li>
  )
}

interface AttachmentListProps {
  attachments: Attachment[]
  onUpload: (file: File) => void
  onRemove: (id: number) => void
}

export function AttachmentList({
  attachments,
  onUpload,
  onRemove,
}: AttachmentListProps) {
  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) {
      onUpload(file)
    }
    event.target.value = ''
  }

  return (
    <div>
      <ul className="attachment-list">
        {attachments.map((attachment) => (
          <AttachmentItem
            key={attachment.id}
            attachment={attachment}
            onRemove={onRemove}
          />
        ))}
      </ul>
      <label className="button">
        Attach a file
        <input
          type="file"
          className="visually-hidden"
          onChange={handleFileChange}
        />
      </label>
    </div>
  )
}
