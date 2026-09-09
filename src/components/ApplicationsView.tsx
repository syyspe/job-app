import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApplicationForm } from './ApplicationForm.tsx'
import { ApplicationList } from './ApplicationList.tsx'
import { ApplicationSort } from './ApplicationSort.tsx'
import {
  UnauthorizedError,
  createApplication,
  deleteApplication,
  deleteAttachment,
  listApplications,
  updateApplication,
  uploadAttachment,
} from '../lib/api.ts'
import { sortApplications } from '../lib/sorting.ts'
import { useToast } from '../lib/toast.ts'
import type { Sort } from '../lib/sorting.ts'
import type { Application, ApplicationInput } from '../types.ts'

function useApplications(onUnauthorized: () => void) {
  const [applications, setApplications] = useState<Application[]>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const { showSuccess, showError } = useToast()

  const run = useCallback(
    async (task: () => Promise<void>, successMessage?: string) => {
      try {
        await task()
        if (successMessage) showSuccess(successMessage)
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          showError('Your session expired — please log in again')
          onUnauthorized()
          return
        }
        showError(error instanceof Error ? error.message : 'Something went wrong')
      }
    },
    [onUnauthorized, showSuccess, showError],
  )

  async function reload() {
    setApplications(await listApplications())
  }

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- reload() sets state after an await, not synchronously
    void run(reload)
  }, [run])

  async function handleAdd(input: ApplicationInput) {
    await run(async () => {
      await createApplication(input)
      await reload()
    }, 'Application added')
  }

  async function handleUpdate(id: number, input: ApplicationInput) {
    await run(async () => {
      await updateApplication(id, input)
      await reload()
    }, 'Application saved')
  }

  async function handleDelete(id: number) {
    await run(async () => {
      await deleteApplication(id)
      setExpandedId((current) => (current === id ? null : current))
      await reload()
    }, 'Application deleted')
  }

  async function handleUploadAttachment(applicationId: number, file: File) {
    await run(async () => {
      await uploadAttachment(applicationId, file)
      await reload()
    }, 'Attachment uploaded')
  }

  async function handleRemoveAttachment(attachmentId: number) {
    await run(async () => {
      await deleteAttachment(attachmentId)
      await reload()
    }, 'Attachment removed')
  }

  return {
    applications,
    expandedId,
    setExpandedId,
    handleAdd,
    handleUpdate,
    handleDelete,
    handleUploadAttachment,
    handleRemoveAttachment,
  }
}

interface ApplicationsViewProps {
  onUnauthorized: () => void
}

export function ApplicationsView({ onUnauthorized }: ApplicationsViewProps) {
  const {
    applications,
    expandedId,
    setExpandedId,
    handleAdd,
    handleUpdate,
    handleDelete,
    handleUploadAttachment,
    handleRemoveAttachment,
  } = useApplications(onUnauthorized)
  const [sort, setSort] = useState<Sort>({ field: 'createdAt', direction: 'desc' })
  const sortedApplications = useMemo(
    () => sortApplications(applications, sort),
    [applications, sort],
  )

  return (
    <div className="layout">
      <section className="panel">
        <h2>Add an application</h2>
        <ApplicationForm submitLabel="Add application" onSubmit={handleAdd} />
      </section>
      <div>
        <ApplicationSort sort={sort} onChange={setSort} />
        <ApplicationList
          applications={sortedApplications}
          expandedId={expandedId}
          onToggle={(id) =>
            setExpandedId((current) => (current === id ? null : id))
          }
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onUploadAttachment={handleUploadAttachment}
          onRemoveAttachment={handleRemoveAttachment}
        />
      </div>
    </div>
  )
}
