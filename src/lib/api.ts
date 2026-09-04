import type { Application, ApplicationInput, Attachment, User } from '../types.ts'

export class UnauthorizedError extends Error {
  constructor() {
    super('unauthorized')
  }
}

async function checkOk(response: Response): Promise<Response> {
  if (response.status === 401) {
    throw new UnauthorizedError()
  }
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

export async function login(username: string, password: string): Promise<User> {
  const response = await fetch('/api/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  return parseJson(response)
}

export async function logout(): Promise<void> {
  await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' })
}

export async function getCurrentUser(): Promise<User | null> {
  const response = await fetch('/api/me', { credentials: 'same-origin' })
  if (response.status === 401) return null
  return parseJson(response)
}

export async function listApplications(): Promise<Application[]> {
  const response = await fetch('/api/applications', { credentials: 'same-origin' })
  return parseJson(response)
}

export async function createApplication(
  input: ApplicationInput,
): Promise<Application> {
  const response = await fetch('/api/applications', {
    method: 'POST',
    credentials: 'same-origin',
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
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return parseJson(response)
}

export async function deleteApplication(id: number): Promise<void> {
  await checkOk(
    await fetch(`/api/applications/${id}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    }),
  )
}

export async function uploadAttachment(
  applicationId: number,
  file: File,
): Promise<Attachment> {
  const body = new FormData()
  body.append('file', file)
  const response = await fetch(
    `/api/applications/${applicationId}/attachments`,
    { method: 'POST', credentials: 'same-origin', body },
  )
  return parseJson(response)
}

export async function deleteAttachment(id: number): Promise<void> {
  await checkOk(
    await fetch(`/api/attachments/${id}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    }),
  )
}

export function attachmentUrl(id: number): string {
  return `/api/attachments/${id}`
}
