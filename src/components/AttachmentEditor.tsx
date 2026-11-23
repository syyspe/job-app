import { useState } from 'react'
import type { Attachment } from '../types.ts'

// The server's editedName, duplicated: the client never imports server/.
function editedName(name: string): string {
  return `${name.slice(0, -'.md'.length)} (edited).md`
}

interface AttachmentEditorProps {
  attachment: Attachment
  initialText: string
  onSave: (text: string) => void
  onCancel: () => void
}

export function AttachmentEditor({ attachment, initialText, onSave, onCancel }: AttachmentEditorProps) {
  const [text, setText] = useState(initialText)
  const isOriginal = attachment.editedFromId === null

  return (
    <div className="attachment-editor">
      <label>
        Edit {attachment.originalName}
        <textarea rows={20} value={text} onChange={(event) => setText(event.target.value)} />
      </label>
      {isOriginal && (
        <p className="attachment-editor-hint">
          Saving keeps the original and writes it as {editedName(attachment.originalName)}.
        </p>
      )}
      <div className="attachment-actions">
        <button
          type="button"
          className="button button-primary"
          aria-label={`Save ${attachment.originalName}`}
          onClick={() => onSave(text)}
        >
          Save
        </button>
        <button
          type="button"
          className="button"
          aria-label={`Cancel editing ${attachment.originalName}`}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
