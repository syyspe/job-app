import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { ApplicationsView } from './ApplicationsView'
import type { Application } from '../types'

const sampleApplications: Application[] = [
  {
    id: 1,
    company: 'Acme',
    role: 'Engineer',
    dateApplied: '2026-01-15',
    status: 'applied',
    link: '',
    notes: '',
    attachments: [],
  },
]

afterEach(() => {
  vi.unstubAllGlobals()
})

test('loads and renders applications from the API', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(sampleApplications), { status: 200 }),
    ),
  )
  render(<ApplicationsView onUnauthorized={vi.fn()} />)
  expect(
    await screen.findByRole('button', { name: /Acme/ }),
  ).toBeVisible()
})

test('a 401 from the API calls onUnauthorized', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }),
    ),
  )
  const onUnauthorized = vi.fn()
  render(<ApplicationsView onUnauthorized={onUnauthorized} />)

  await waitFor(() => expect(onUnauthorized).toHaveBeenCalled())
})
