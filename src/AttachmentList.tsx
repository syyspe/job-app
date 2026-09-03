import type { ChangeEvent } from 'react'
import { attachmentUrl } from './api.ts'
import type { Attachment } from './types.ts'

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
          <li key={attachment.id} className="attachment-item">
            <a href={attachmentUrl(attachment.id)}>
              {attachment.originalName}
            </a>
            <button
              type="button"
              className="button"
              onClick={() => onRemove(attachment.id)}
            >
              Remove
            </button>
          </li>
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
