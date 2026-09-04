import { useEffect, useState } from 'react'
import { ApplicationForm } from './components/ApplicationForm.tsx'
import { ApplicationList } from './components/ApplicationList.tsx'
import {
  createApplication,
  deleteApplication,
  deleteAttachment,
  listApplications,
  updateApplication,
  uploadAttachment,
} from './lib/api.ts'
import type { Application, ApplicationInput } from './types.ts'
import './App.css'

function App() {
  const [applications, setApplications] = useState<Application[]>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)

  async function reload() {
    setApplications(await listApplications())
  }

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- reload() sets state after an await, not synchronously
    void reload()
  }, [])

  async function handleAdd(input: ApplicationInput) {
    await createApplication(input)
    await reload()
  }

  async function handleUpdate(id: number, input: ApplicationInput) {
    await updateApplication(id, input)
    await reload()
  }

  async function handleDelete(id: number) {
    await deleteApplication(id)
    setExpandedId((current) => (current === id ? null : current))
    await reload()
  }

  async function handleUploadAttachment(applicationId: number, file: File) {
    await uploadAttachment(applicationId, file)
    await reload()
  }

  async function handleRemoveAttachment(attachmentId: number) {
    await deleteAttachment(attachmentId)
    await reload()
  }

  return (
    <main>
      <h1>Job applications</h1>
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
    </main>
  )
}

export default App
