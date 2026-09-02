import { ApplicationDetail } from './ApplicationDetail.tsx'
import type { Application, ApplicationInput } from './types.ts'

interface ApplicationListProps {
  applications: Application[]
  expandedId: number | null
  onToggle: (id: number) => void
  onUpdate: (id: number, input: ApplicationInput) => void
  onDelete: (id: number) => void
}

export function ApplicationList({
  applications,
  expandedId,
  onToggle,
  onUpdate,
  onDelete,
}: ApplicationListProps) {
  if (applications.length === 0) {
    return <p>No applications yet.</p>
  }

  return (
    <ul>
      {applications.map((application) => (
        <li key={application.id}>
          <button type="button" onClick={() => onToggle(application.id)}>
            {application.company} — {application.role} ({application.status})
          </button>
          {expandedId === application.id && (
            <ApplicationDetail
              application={application}
              onUpdate={(input) => onUpdate(application.id, input)}
              onDelete={() => onDelete(application.id)}
            />
          )}
        </li>
      ))}
    </ul>
  )
}
