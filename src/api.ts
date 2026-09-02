import type { Application, ApplicationInput, Attachment } from './types.ts'

async function checkOk(response: Response): Promise<Response> {
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : response.statusText
    throw new Error(message)
  }
  return response
}

async function parseJson<T>(response: Response): Promise<T> {
  return (await checkOk(response)).json() as Promise<T>
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
  await checkOk(await fetch(`/api/applications/${id}`, { method: 'DELETE' }))
}

export async function uploadAttachment(
  applicationId: number,
  file: File,
): Promise<Attachment> {
  const body = new FormData()
  body.append('file', file)
  const response = await fetch(
    `/api/applications/${applicationId}/attachments`,
    { method: 'POST', body },
  )
  return parseJson(response)
}

export async function deleteAttachment(id: number): Promise<void> {
  await checkOk(await fetch(`/api/attachments/${id}`, { method: 'DELETE' }))
}

export function attachmentUrl(id: number): string {
  return `/api/attachments/${id}`
}
