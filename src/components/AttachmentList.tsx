import type { ChangeEvent } from 'react'
import { attachmentUrl } from '../lib/api.ts'
import type { Attachment } from '../types.ts'

interface AttachmentItemProps {
  attachment: Attachment
  onSetProfileSync: (id: number, pending: boolean) => void
  onRemove: (id: number) => void
}

function ProfileSyncToggle({ attachment, onSetProfileSync }: Omit<AttachmentItemProps, 'onRemove'>) {
  const { id, originalName, profileSyncPending } = attachment
  if (!profileSyncPending) {
    return (
      <button
        type="button"
        className="button"
        aria-label={`Add ${originalName} to profile`}
        onClick={() => onSetProfileSync(id, true)}
      >
        Add to profile
      </button>
    )
  }
  return (
    <>
      <span className="sync-pending">Pending profile sync</span>
      <button
        type="button"
        className="button"
        aria-label={`Don't add ${originalName} to profile`}
        onClick={() => onSetProfileSync(id, false)}
      >
        Don&apos;t add
      </button>
    </>
  )
}

function AttachmentItem({ attachment, onSetProfileSync, onRemove }: AttachmentItemProps) {
  return (
    <li className="attachment-item">
      <a href={attachmentUrl(attachment.id)}>{attachment.originalName}</a>
      <div className="attachment-actions">
        <ProfileSyncToggle attachment={attachment} onSetProfileSync={onSetProfileSync} />
        <button
          type="button"
          className="button button-danger"
          onClick={() => onRemove(attachment.id)}
        >
          Remove file
        </button>
      </div>
    </li>
  )
}

interface AttachmentListProps {
  attachments: Attachment[]
  onUpload: (file: File) => void
  onSetProfileSync: (id: number, pending: boolean) => void
  onRemove: (id: number) => void
}

export function AttachmentList({
  attachments,
  onUpload,
  onSetProfileSync,
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
            onSetProfileSync={onSetProfileSync}
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
