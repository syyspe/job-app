import { ApplicationDetail } from './ApplicationDetail.tsx'
import type { DraftEditing } from './ApplicationDetail.tsx'
import { formatDate } from '../lib/dates.ts'
import { STATUS_LABELS } from '../lib/status.ts'
import type { Application, ApplicationInput } from '../types.ts'

function EmptyState({ hiddenArchivedCount }: { hiddenArchivedCount: number }) {
  if (hiddenArchivedCount > 0) {
    return (
      <div className="empty-state">
        <p className="empty-state-title">Nothing to show</p>
        <p>
          {hiddenArchivedCount === 1
            ? '1 archived application is hidden.'
            : `${hiddenArchivedCount} archived applications are hidden.`}
        </p>
      </div>
    )
  }

  return (
    <div className="empty-state">
      <p className="empty-state-title">Nothing tracked yet</p>
      <p>Add your first application with the form.</p>
    </div>
  )
}

interface RowSummaryProps {
  application: Application
  expanded: boolean
  onToggle: () => void
}

function RowSummary({ application, expanded, onToggle }: RowSummaryProps) {
  return (
    <button
      type="button"
      className="row-button"
      aria-expanded={expanded}
      onClick={onToggle}
    >
      <span className="row-company">{application.company}</span>
      <span className="row-role">{application.role}</span>
      <span className="row-status">{STATUS_LABELS[application.status]}</span>
      {application.deadline && (
        <span className="row-deadline">
          due {formatDate(application.deadline)}
        </span>
      )}
    </button>
  )
}

interface ApplicationRowProps {
  application: Application
  expanded: boolean
  onToggle: () => void
  onUpdate: (input: ApplicationInput) => void
  onDelete: () => void
  onUploadAttachment: (file: File) => void
  onSetProfileSync: (attachmentId: number, pending: boolean) => void
  onRemoveAttachment: (attachmentId: number) => void
  onSetArchived: (archived: boolean) => void
  drafting: DraftEditing
}

function ApplicationRow({
  application,
  expanded,
  onToggle,
  onUpdate,
  onDelete,
  onUploadAttachment,
  onSetProfileSync,
  onRemoveAttachment,
  onSetArchived,
  drafting,
}: ApplicationRowProps) {
  return (
    <li
      className="application-item"
      data-status={application.status}
      data-archived={application.archived}
    >
      <RowSummary application={application} expanded={expanded} onToggle={onToggle} />
      {expanded && (
        <ApplicationDetail
          application={application}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onUploadAttachment={onUploadAttachment}
          onSetProfileSync={onSetProfileSync}
          onRemoveAttachment={onRemoveAttachment}
          onSetArchived={onSetArchived}
          drafting={drafting}
        />
      )}
    </li>
  )
}

// The loaded questions are the expanded application's, so only its row gets them.
function rowDrafting(drafting: DraftEditing, expanded: boolean): DraftEditing {
  return { ...drafting, questions: expanded ? drafting.questions : [] }
}

interface ApplicationListProps {
  applications: Application[]
  expandedId: number | null
  onToggle: (id: number) => void
  onUpdate: (id: number, input: ApplicationInput) => void
  onDelete: (id: number) => void
  onUploadAttachment: (applicationId: number, file: File) => void
  onSetProfileSync: (attachmentId: number, pending: boolean) => void
  onRemoveAttachment: (attachmentId: number) => void
  onSetArchived: (id: number, archived: boolean) => void
  hiddenArchivedCount: number
  drafting: DraftEditing
}

export function ApplicationList({
  applications,
  expandedId,
  onToggle,
  onUpdate,
  onDelete,
  onUploadAttachment,
  onSetProfileSync,
  onRemoveAttachment,
  onSetArchived,
  hiddenArchivedCount,
  drafting,
}: ApplicationListProps) {
  if (applications.length === 0) {
    return <EmptyState hiddenArchivedCount={hiddenArchivedCount} />
  }

  return (
    <ul className="application-list">
      {applications.map((application) => (
        <ApplicationRow
          key={application.id}
          application={application}
          expanded={expandedId === application.id}
          onToggle={() => onToggle(application.id)}
          onUpdate={(input) => onUpdate(application.id, input)}
          onDelete={() => onDelete(application.id)}
          onUploadAttachment={(file) =>
            onUploadAttachment(application.id, file)
          }
          onSetProfileSync={onSetProfileSync}
          onRemoveAttachment={onRemoveAttachment}
          onSetArchived={(archived) => onSetArchived(application.id, archived)}
          drafting={rowDrafting(drafting, expandedId === application.id)}
        />
      ))}
    </ul>
  )
}
