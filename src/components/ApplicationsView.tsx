import { useEffect, useMemo, useState } from 'react'
import { ApplicationForm } from './ApplicationForm.tsx'
import { ApplicationList } from './ApplicationList.tsx'
import { ApplicationSort } from './ApplicationSort.tsx'
import { ArchivedToggle } from './ArchivedToggle.tsx'
import { Pagination } from './Pagination.tsx'
import {
  createApplication,
  deleteApplication,
  deleteAttachment,
  getConfig,
  listApplications,
  setArchived,
  updateApplication,
  uploadAttachment,
} from '../lib/api.ts'
import { useApiAction } from '../lib/apiAction.ts'
import { paginate } from '../lib/paging.ts'
import { sortApplications } from '../lib/sorting.ts'
import type { Sort } from '../lib/sorting.ts'
import type { Application, ApplicationInput } from '../types.ts'

type Change = (call: () => Promise<unknown>, message: string) => Promise<void>

function changeHandlers(change: Change) {
  return {
    handleAdd: (input: ApplicationInput) =>
      change(() => createApplication(input), 'Application added'),
    handleUpdate: (id: number, input: ApplicationInput) =>
      change(() => updateApplication(id, input), 'Application saved'),
    handleSetArchived: (id: number, archived: boolean) =>
      change(
        () => setArchived(id, archived),
        archived ? 'Application archived' : 'Application unarchived',
      ),
    handleUploadAttachment: (applicationId: number, file: File) =>
      change(() => uploadAttachment(applicationId, file), 'Attachment uploaded'),
    handleRemoveAttachment: (attachmentId: number) =>
      change(() => deleteAttachment(attachmentId), 'Attachment removed'),
  }
}

function useApplications(onUnauthorized: () => void) {
  const [applications, setApplications] = useState<Application[]>([])
  const [pageSize, setPageSize] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const run = useApiAction(onUnauthorized)

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

  async function change(call: () => Promise<unknown>, message: string) {
    await run(async () => {
      await call()
      await reload()
    }, message)
  }

  async function handleDelete(id: number) {
    await run(async () => {
      await deleteApplication(id)
      setExpandedId((current) => (current === id ? null : current))
      await reload()
    }, 'Application deleted')
  }

  return {
    applications,
    pageSize,
    expandedId,
    setExpandedId,
    handleDelete,
    ...changeHandlers(change),
  }
}

function useListView(applications: Application[], pageSize: number | null) {
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
  const { items, page: currentPage, pageCount } = useMemo(
    () => paginate(visibleApplications, page, pageSize),
    [visibleApplications, page, pageSize],
  )

  return {
    items,
    currentPage,
    pageCount,
    setPage,
    sort,
    showArchived,
    archivedCount,
    hiddenArchivedCount: showArchived ? 0 : archivedCount,
    changeSort: (next: Sort) => {
      setSort(next)
      setPage(1)
    },
    changeShowArchived: (next: boolean) => {
      setShowArchived(next)
      setPage(1)
    },
    resetPage: () => setPage(1),
  }
}

interface ApplicationsViewProps {
  onUnauthorized: () => void
}

export function ApplicationsView({ onUnauthorized }: ApplicationsViewProps) {
  const apps = useApplications(onUnauthorized)
  const list = useListView(apps.applications, apps.pageSize)

  async function handleAdd(input: ApplicationInput) {
    await apps.handleAdd(input)
    list.resetPage()
  }

  function handleToggle(id: number) {
    apps.setExpandedId((current) => (current === id ? null : id))
  }

  return (
    <div className="layout">
      <section className="panel">
        <h2>Add an application</h2>
        <ApplicationForm submitLabel="Add application" onSubmit={handleAdd} />
      </section>
      <div>
        <ApplicationSort sort={list.sort} onChange={list.changeSort} />
        <ApplicationList
          applications={list.items}
          expandedId={apps.expandedId}
          onToggle={handleToggle}
          onUpdate={apps.handleUpdate}
          onDelete={apps.handleDelete}
          onUploadAttachment={apps.handleUploadAttachment}
          onRemoveAttachment={apps.handleRemoveAttachment}
          onSetArchived={apps.handleSetArchived}
          hiddenArchivedCount={list.hiddenArchivedCount}
        />
        <Pagination page={list.currentPage} pageCount={list.pageCount} onChange={list.setPage} />
        <ArchivedToggle
          count={list.archivedCount}
          showArchived={list.showArchived}
          onChange={list.changeShowArchived}
        />
      </div>
    </div>
  )
}
