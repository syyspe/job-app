import { useEffect, useState } from 'react'
import { ApplicationForm } from './ApplicationForm.tsx'
import { ApplicationList } from './ApplicationList.tsx'
import {
  createApplication,
  deleteApplication,
  listApplications,
  updateApplication,
} from './api.ts'
import type { Application, ApplicationInput } from './types.ts'
import './App.css'

function App() {
  const [applications, setApplications] = useState<Application[]>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)

  async function reload() {
    setApplications(await listApplications())
  }

  useEffect(() => {
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

  return (
    <main>
      <h1>Job applications</h1>
      <ApplicationForm submitLabel="Add application" onSubmit={handleAdd} />
      <ApplicationList
        applications={applications}
        expandedId={expandedId}
        onToggle={(id) =>
          setExpandedId((current) => (current === id ? null : id))
        }
        onUpdate={handleUpdate}
        onDelete={handleDelete}
      />
    </main>
  )
}

export default App
