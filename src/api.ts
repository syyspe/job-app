import type { Application, ApplicationInput } from './types.ts'

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

export async function listApplications(): Promise<Application[]> {
  const response = await fetch('/api/applications')
  return parseJson(response)
}

export async function createApplication(
  input: ApplicationInput,
): Promise<Application> {
  const response = await fetch('/api/applications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return parseJson(response)
}

export async function updateApplication(
  id: number,
  input: ApplicationInput,
): Promise<Application> {
  const response = await fetch(`/api/applications/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return parseJson(response)
}

export async function deleteApplication(id: number): Promise<void> {
  await fetch(`/api/applications/${id}`, { method: 'DELETE' })
}
