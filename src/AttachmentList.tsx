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
      <ul>
        {attachments.map((attachment) => (
          <li key={attachment.id}>
            <a href={attachmentUrl(attachment.id)}>
              {attachment.originalName}
            </a>
            <button type="button" onClick={() => onRemove(attachment.id)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <label>
        Attach a file
        <input type="file" onChange={handleFileChange} />
      </label>
    </div>
  )
}
