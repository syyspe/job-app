import { ApplicationForm } from './ApplicationForm.tsx'
import { AttachmentList } from './AttachmentList.tsx'
import { OpenQuestions } from './OpenQuestions.tsx'
import { formatTimestamp } from '../lib/dates.ts'
import type { Application, ApplicationInput, OpenQuestion } from '../types.ts'

/** The draft-finishing props: open questions and the .md attachment editor. */
export interface DraftEditing {
  questions: OpenQuestion[]
  onLoadAttachmentText: (attachmentId: number) => Promise<string | null>
  onSaveAttachmentText: (attachmentId: number, text: string) => Promise<boolean>
}

interface ApplicationDetailProps {
  application: Application
  onUpdate: (input: ApplicationInput) => void
  onDelete: () => void
  onUploadAttachment: (file: File) => void
  onSetProfileSync: (attachmentId: number, pending: boolean) => void
  onRemoveAttachment: (attachmentId: number) => void
  onSetArchived: (archived: boolean) => void
  drafting: DraftEditing
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
  onSetProfileSync,
  onRemoveAttachment,
  onSetArchived,
  drafting,
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
      <OpenQuestions questions={drafting.questions} />
      <AttachmentList
        attachments={application.attachments}
        onUpload={onUploadAttachment}
        onSetProfileSync={onSetProfileSync}
        onRemove={onRemoveAttachment}
        editing={{ onLoadText: drafting.onLoadAttachmentText, onSaveText: drafting.onSaveAttachmentText }}
      />
    </ApplicationForm>
  )
}
