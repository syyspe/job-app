import type {
  AdHandoverInput,
  AdState,
  AdSummary,
  AppConfig,
  Application,
  ApplicationInput,
  Attachment,
  OpenQuestion,
  Role,
  User,
  UserInput,
} from '../types.ts'

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

export async function listUsers(): Promise<User[]> {
  const response = await fetch('/api/users', { credentials: 'same-origin' })
  return parseJson(response)
}

export async function createUser(input: UserInput): Promise<User> {
  const response = await fetch('/api/users', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return parseJson(response)
}

export async function setUserRole(id: number, role: Role): Promise<User> {
  const response = await fetch(`/api/users/${id}/role`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  })
  return parseJson(response)
}

export async function resetUserPassword(id: number, password: string): Promise<User> {
  const response = await fetch(`/api/users/${id}/password`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  return parseJson(response)
}

export async function deleteUser(id: number): Promise<void> {
  await checkOk(
    await fetch(`/api/users/${id}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    }),
  )
}

export async function getConfig(): Promise<AppConfig> {
  const response = await fetch('/api/config', { credentials: 'same-origin' })
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

export async function setArchived(id: number, archived: boolean): Promise<Application> {
  const response = await fetch(`/api/applications/${id}/archived`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ archived }),
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

export async function setAttachmentProfileSync(
  id: number,
  pending: boolean,
): Promise<Attachment> {
  const response = await fetch(`/api/attachments/${id}/profile-sync`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pending }),
  })
  return parseJson(response)
}

export async function getAttachmentText(id: number): Promise<string> {
  const response = await fetch(attachmentUrl(id), { credentials: 'same-origin' })
  return (await checkOk(response)).text()
}

/** Answers with the row written: on an original, that is its new "(edited)" copy. */
export async function saveAttachmentText(id: number, text: string): Promise<Attachment> {
  const response = await fetch(`/api/attachments/${id}/text`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  return parseJson(response)
}

export async function getOpenQuestions(applicationId: number): Promise<OpenQuestion[]> {
  const response = await fetch(`/api/applications/${applicationId}/questions`, {
    credentials: 'same-origin',
  })
  return parseJson(response)
}

export async function answerQuestions(
  applicationId: number,
  answers: Record<string, string>,
): Promise<OpenQuestion[]> {
  const response = await fetch(`/api/applications/${applicationId}/answers`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  })
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

export async function listAds(): Promise<AdSummary[]> {
  const response = await fetch('/api/ads', { credentials: 'same-origin' })
  return parseJson(response)
}

export async function transitionAd(id: number, to: AdState): Promise<AdSummary> {
  const response = await fetch(`/api/ads/${id}/transition`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to }),
  })
  return parseJson(response)
}

export async function handoverAd(id: number, input: AdHandoverInput): Promise<AdSummary> {
  const response = await fetch(`/api/ads/${id}/handover`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return parseJson(response)
}

/** Marks the ad for the next daily run to fetch; the ad stays awaiting hand-over. */
export async function requestFetch(id: number): Promise<AdSummary> {
  const response = await fetch(`/api/ads/${id}/fetch-request`, {
    method: 'POST',
    credentials: 'same-origin',
  })
  return parseJson(response)
}

export function attachmentUrl(id: number): string {
  return `/api/attachments/${id}`
}
