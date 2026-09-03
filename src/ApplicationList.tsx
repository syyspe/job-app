import { ApplicationDetail } from './ApplicationDetail.tsx'
import type { Application, ApplicationInput } from './types.ts'

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
    return <p>No applications yet.</p>
  }

  return (
    <ul className="application-list">
      {applications.map((application) => (
        <li key={application.id} className="application-item">
          <button
            type="button"
            className="row-button"
            onClick={() => onToggle(application.id)}
          >
            {application.company} — {application.role} ({application.status})
          </button>
          {expandedId === application.id && (
            <ApplicationDetail
              application={application}
              onUpdate={(input) => onUpdate(application.id, input)}
              onDelete={() => onDelete(application.id)}
              onUploadAttachment={(file) =>
                onUploadAttachment(application.id, file)
              }
              onRemoveAttachment={onRemoveAttachment}
            />
          )}
        </li>
      ))}
    </ul>
  )
}
