import { useCallback, useEffect, useState } from 'react'
import { ApplicationForm } from './ApplicationForm.tsx'
import { ApplicationList } from './ApplicationList.tsx'
import {
  UnauthorizedError,
  createApplication,
  deleteApplication,
  deleteAttachment,
  listApplications,
  updateApplication,
  uploadAttachment,
} from '../lib/api.ts'
import type { Application, ApplicationInput } from '../types.ts'

function useApplications(onUnauthorized: () => void) {
  const [applications, setApplications] = useState<Application[]>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const run = useCallback(
    async (task: () => Promise<void>) => {
      try {
        await task()
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          onUnauthorized()
          return
        }
        throw error
      }
    },
    [onUnauthorized],
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
    })
  }

  async function handleUpdate(id: number, input: ApplicationInput) {
    await run(async () => {
      await updateApplication(id, input)
      await reload()
    })
  }

  async function handleDelete(id: number) {
    await run(async () => {
      await deleteApplication(id)
      setExpandedId((current) => (current === id ? null : current))
      await reload()
    })
  }

  async function handleUploadAttachment(applicationId: number, file: File) {
    await run(async () => {
      await uploadAttachment(applicationId, file)
      await reload()
    })
  }

  async function handleRemoveAttachment(attachmentId: number) {
    await run(async () => {
      await deleteAttachment(attachmentId)
      await reload()
    })
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

  return (
    <div className="layout">
      <ApplicationForm submitLabel="Add application" onSubmit={handleAdd} />
      <ApplicationList
        applications={applications}
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
  )
}
