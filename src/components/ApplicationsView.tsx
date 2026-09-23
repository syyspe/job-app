import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApplicationForm } from './ApplicationForm.tsx'
import { ApplicationList } from './ApplicationList.tsx'
import { ApplicationSort } from './ApplicationSort.tsx'
import { ArchivedToggle } from './ArchivedToggle.tsx'
import { Pagination } from './Pagination.tsx'
import {
  UnauthorizedError,
  createApplication,
  deleteApplication,
  deleteAttachment,
  getConfig,
  listApplications,
  setArchived,
  updateApplication,
  uploadAttachment,
} from '../lib/api.ts'
import { paginate } from '../lib/paging.ts'
import { sortApplications } from '../lib/sorting.ts'
import { useToast } from '../lib/toast.ts'
import type { Sort } from '../lib/sorting.ts'
import type { Application, ApplicationInput } from '../types.ts'

function useApplications(onUnauthorized: () => void) {
  const [applications, setApplications] = useState<Application[]>([])
  const [pageSize, setPageSize] = useState<number | null>(null)
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

  async function load() {
    const [config, list] = await Promise.all([getConfig(), listApplications()])
    setPageSize(config.pageSize)
    setApplications(list)
  }

  useEffect(() => {
    void run(load)
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

  async function handleSetArchived(id: number, archived: boolean) {
    await run(async () => {
      await setArchived(id, archived)
      await reload()
    }, archived ? 'Application archived' : 'Application unarchived')
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
    pageSize,
    expandedId,
    setExpandedId,
    handleAdd,
    handleUpdate,
    handleDelete,
    handleSetArchived,
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
    pageSize,
    expandedId,
    setExpandedId,
    handleAdd,
    handleUpdate,
    handleDelete,
    handleSetArchived,
    handleUploadAttachment,
    handleRemoveAttachment,
  } = useApplications(onUnauthorized)
  const [sort, setSort] = useState<Sort>({ field: 'createdAt', direction: 'desc' })
  const [showArchived, setShowArchived] = useState(false)
  const [page, setPage] = useState(1)
  const archivedCount = useMemo(
    () => applications.filter((application) => application.archived).length,
    [applications],
  )
  const visibleApplications = useMemo(() => {
    const visible = showArchived
      ? applications
      : applications.filter((application) => !application.archived)
    return sortApplications(visible, sort)
  }, [applications, showArchived, sort])
  const { items: pageApplications, page: currentPage, pageCount } = useMemo(
    () => paginate(visibleApplications, page, pageSize),
    [visibleApplications, page, pageSize],
  )

  return (
    <div className="layout">
      <section className="panel">
        <h2>Add an application</h2>
        <ApplicationForm
          submitLabel="Add application"
          onSubmit={async (input) => {
            await handleAdd(input)
            setPage(1)
          }}
        />
      </section>
      <div>
        <ApplicationSort
          sort={sort}
          onChange={(next) => {
            setSort(next)
            setPage(1)
          }}
        />
        <ApplicationList
          applications={pageApplications}
          expandedId={expandedId}
          onToggle={(id) =>
            setExpandedId((current) => (current === id ? null : id))
          }
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onUploadAttachment={handleUploadAttachment}
          onRemoveAttachment={handleRemoveAttachment}
          onSetArchived={handleSetArchived}
          hiddenArchivedCount={showArchived ? 0 : archivedCount}
        />
        <Pagination page={currentPage} pageCount={pageCount} onChange={setPage} />
        <ArchivedToggle
          count={archivedCount}
          showArchived={showArchived}
          onChange={(next) => {
            setShowArchived(next)
            setPage(1)
          }}
        />
      </div>
    </div>
  )
}
