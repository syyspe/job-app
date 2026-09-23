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
  onSetArchived: (archived: boolean) => void
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

interface DetailActionsProps {
  archived: boolean
  onSetArchived: (archived: boolean) => void
  onDelete: () => void
}

function DetailActions({ archived, onSetArchived, onDelete }: DetailActionsProps) {
  return (
    <>
      <button
        type="button"
        className="button"
        onClick={() => onSetArchived(!archived)}
      >
        {archived ? 'Unarchive' : 'Archive'}
      </button>
      <button
        type="button"
        className="button button-danger action-end"
        onClick={onDelete}
      >
        Delete application
      </button>
    </>
  )
}

export function ApplicationDetail({
  application,
  onUpdate,
  onDelete,
  onUploadAttachment,
  onRemoveAttachment,
  onSetArchived,
}: ApplicationDetailProps) {
  return (
    <ApplicationForm
      initial={toInput(application)}
      submitLabel="Save"
      onSubmit={onUpdate}
      actions={
        <DetailActions
          archived={application.archived}
          onSetArchived={onSetArchived}
          onDelete={onDelete}
        />
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
