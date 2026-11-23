import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { AttachmentEditor } from './AttachmentEditor.tsx'
import { attachmentUrl } from '../lib/api.ts'
import type { Attachment } from '../types.ts'

interface ProfileSyncToggleProps {
  attachment: Attachment
  onSetProfileSync: (id: number, pending: boolean) => void
}

function ProfileSyncToggle({ attachment, onSetProfileSync }: ProfileSyncToggleProps) {
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

interface EditControlProps {
  attachment: Attachment
  superseded: boolean
  onEdit: () => void
}

function EditControl({ attachment, superseded, onEdit }: EditControlProps) {
  if (superseded) return <span className="superseded-note">Original, kept unchanged</span>
  if (!attachment.originalName.toLowerCase().endsWith('.md')) return null
  return (
    <button
      type="button"
      className="button"
      aria-label={`Edit ${attachment.originalName}`}
      onClick={onEdit}
    >
      Edit
    </button>
  )
}

export interface AttachmentTextHandlers {
  onLoadText: (id: number) => Promise<string | null>
  onSaveText: (id: number, text: string) => Promise<boolean>
}

type AttachmentItemProps = Omit<EditControlProps, 'onEdit'> & {
  onSetProfileSync: (id: number, pending: boolean) => void
  onRemove: (id: number) => void
  editing: AttachmentTextHandlers
}

function AttachmentItem(props: AttachmentItemProps) {
  const { attachment, superseded, onSetProfileSync, onRemove, editing } = props
  const [draft, setDraft] = useState<string | null>(null)

  async function handleEdit() {
    const text = await editing.onLoadText(attachment.id)
    if (text !== null) setDraft(text)
  }

  async function handleSave(text: string) {
    if (await editing.onSaveText(attachment.id, text)) setDraft(null)
  }

  return (
    <li className="attachment-item" data-superseded={superseded}>
      <a href={attachmentUrl(attachment.id)}>{attachment.originalName}</a>
      {draft !== null ? (
        <AttachmentEditor
          attachment={attachment}
          initialText={draft}
          onSave={handleSave}
          onCancel={() => setDraft(null)}
        />
      ) : (
        <div className="attachment-actions">
          <EditControl attachment={attachment} superseded={superseded} onEdit={handleEdit} />
          <ProfileSyncToggle attachment={attachment} onSetProfileSync={onSetProfileSync} />
          <button
            type="button"
            className="button button-danger"
            onClick={() => onRemove(attachment.id)}
          >
            Remove file
          </button>
        </div>
      )}
    </li>
  )
}

interface AttachmentListProps {
  attachments: Attachment[]
  onUpload: (file: File) => void
  onSetProfileSync: (id: number, pending: boolean) => void
  onRemove: (id: number) => void
  editing: AttachmentTextHandlers
}

export function AttachmentList({
  attachments,
  onUpload,
  onSetProfileSync,
  onRemove,
  editing,
}: AttachmentListProps) {
  // An original with an edited copy is superseded: the copy is the one to edit.
  const supersededIds = new Set(attachments.map((attachment) => attachment.editedFromId))

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
            superseded={supersededIds.has(attachment.id)}
            onSetProfileSync={onSetProfileSync}
            onRemove={onRemove}
            editing={editing}
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
