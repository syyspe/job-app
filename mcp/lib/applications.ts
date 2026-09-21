import type { Application } from '../../server/types.ts'
import type { ApiClient } from './client.ts'

export async function fetchApplication(client: ApiClient, id: number): Promise<Application> {
  const applications = await client.getJson<Application[]>('/api/applications')
  const found = applications.find((application) => application.id === id)
  if (!found) throw new Error(`no application with id ${id}`)
  return found
}

export function checkDateApplied(input: { status: string; dateApplied: string }): void {
  if (input.status !== 'draft' && !input.dateApplied) {
    throw new Error(
      `status '${input.status}' needs dateApplied (YYYY-MM-DD) — only a draft can have none`,
    )
  }
}
