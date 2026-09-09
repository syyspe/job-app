import { ApplicationDetail } from './ApplicationDetail.tsx'
import { formatDate } from '../lib/dates.ts'
import { STATUS_LABELS } from '../lib/status.ts'
import type { Application, ApplicationInput } from '../types.ts'

function EmptyState() {
  return (
    <div className="empty-state">
      <p className="empty-state-title">Nothing tracked yet</p>
      <p>Add your first application with the form.</p>
    </div>
  )
}

interface ApplicationRowProps {
  application: Application
  expanded: boolean
  onToggle: () => void
  onUpdate: (input: ApplicationInput) => void
  onDelete: () => void
  onUploadAttachment: (file: File) => void
  onRemoveAttachment: (attachmentId: number) => void
}

function ApplicationRow({
  application,
  expanded,
  onToggle,
  onUpdate,
  onDelete,
  onUploadAttachment,
  onRemoveAttachment,
}: ApplicationRowProps) {
  return (
    <li className="application-item" data-status={application.status}>
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
      {expanded && (
        <ApplicationDetail
          application={application}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onUploadAttachment={onUploadAttachment}
          onRemoveAttachment={onRemoveAttachment}
        />
      )}
    </li>
  )
}

interface ApplicationListProps {
  applications: Application[]
  expandedId: number | null
  onToggle: (id: number) => void
  onUpdate: (id: number, input: ApplicationInput) => void
  onDelete: (id: number) => void
  onUploadAttachment: (applicationId: number, file: File) => void
  onRemoveAttachment: (attachmentId: number) => void
}

export function ApplicationList({
  applications,
  expandedId,
  onToggle,
  onUpdate,
  onDelete,
  onUploadAttachment,
  onRemoveAttachment,
}: ApplicationListProps) {
  if (applications.length === 0) {
    return <EmptyState />
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
          onRemoveAttachment={onRemoveAttachment}
        />
      ))}
    </ul>
  )
}
