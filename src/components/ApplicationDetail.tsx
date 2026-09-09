import { ApplicationForm } from './ApplicationForm.tsx'
import { AttachmentList } from './AttachmentList.tsx'
import { formatTimestamp } from '../lib/dates.ts'
import type { Application, ApplicationInput } from '../types.ts'

interface ApplicationDetailProps {
  application: Application
  onUpdate: (input: ApplicationInput) => void
  onDelete: () => void
  onUploadAttachment: (file: File) => void
  onRemoveAttachment: (attachmentId: number) => void
}

function toInput(application: Application): ApplicationInput {
  return {
    company: application.company,
    role: application.role,
    dateApplied: application.dateApplied,
    deadline: application.deadline,
    status: application.status,
    link: application.link,
    notes: application.notes,
  }
}

export function ApplicationDetail({
  application,
  onUpdate,
  onDelete,
  onUploadAttachment,
  onRemoveAttachment,
}: ApplicationDetailProps) {
  return (
    <ApplicationForm
      initial={toInput(application)}
      submitLabel="Save"
      onSubmit={onUpdate}
      actions={
        <button type="button" className="button" onClick={onDelete}>
          Delete application
        </button>
      }
    >
      <p className="timestamps">
        <span>Created {formatTimestamp(application.createdAt)}</span>
        <span>Updated {formatTimestamp(application.updatedAt)}</span>
      </p>
      <AttachmentList
        attachments={application.attachments}
        onUpload={onUploadAttachment}
        onRemove={onRemoveAttachment}
      />
    </ApplicationForm>
  )
}
