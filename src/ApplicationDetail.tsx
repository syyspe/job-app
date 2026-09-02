import { ApplicationForm } from './ApplicationForm.tsx'
import type { Application, ApplicationInput } from './types.ts'

interface ApplicationDetailProps {
  application: Application
  onUpdate: (input: ApplicationInput) => void
  onDelete: () => void
}

function toInput(application: Application): ApplicationInput {
  return {
    company: application.company,
    role: application.role,
    dateApplied: application.dateApplied,
    status: application.status,
    link: application.link,
    notes: application.notes,
  }
}

export function ApplicationDetail({
  application,
  onUpdate,
  onDelete,
}: ApplicationDetailProps) {
  return (
    <div>
      <ApplicationForm
        initial={toInput(application)}
        submitLabel="Save"
        onSubmit={onUpdate}
      />
      <button type="button" onClick={onDelete}>
        Delete
      </button>
    </div>
  )
}
