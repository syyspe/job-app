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
    deadline: '',
    status: 'applied',
    link: '',
    notes: '',
    createdAt: '2026-01-15 09:00:00',
    updatedAt: '2026-01-15 09:00:00',
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

test('renders newest-created applications first on mount', async () => {
  const outOfOrder: Application[] = [
    { ...sampleApplications[0], id: 1, company: 'Acme', createdAt: '2026-01-01 09:00:00' },
    { ...sampleApplications[0], id: 2, company: 'Globex', createdAt: '2026-03-01 09:00:00' },
    { ...sampleApplications[0], id: 3, company: 'Initech', createdAt: '2026-02-01 09:00:00' },
  ]
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(outOfOrder), { status: 200 })),
  )
  render(<ApplicationsView onUnauthorized={vi.fn()} />)

  await screen.findByRole('button', { name: /Acme/ })
  const rows = screen
    .getAllByRole('button', { name: /Acme|Globex|Initech/ })
    .map((button) => button.textContent)
  expect(rows).toEqual([
    expect.stringContaining('Globex'),
    expect.stringContaining('Initech'),
    expect.stringContaining('Acme'),
  ])
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
