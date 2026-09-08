import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { ApplicationsView } from './ApplicationsView'
import { ToastProvider } from './ToastProvider'
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

function renderView(onUnauthorized = vi.fn()) {
  render(
    <ToastProvider>
      <ApplicationsView onUnauthorized={onUnauthorized} />
    </ToastProvider>,
  )
}

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
  renderView()
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
  renderView()

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
  renderView(onUnauthorized)

  await waitFor(() => expect(onUnauthorized).toHaveBeenCalled())
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Your session expired — please log in again',
  )
})

async function addApplication(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: 'Company' }), 'Globex')
  await user.type(screen.getByRole('textbox', { name: 'Role' }), 'Engineer')
  await user.click(screen.getByRole('button', { name: 'Add application' }))
}

test('a successful add shows a success toast', async () => {
  const user = userEvent.setup()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'POST'
        ? new Response(JSON.stringify(sampleApplications[0]), { status: 201 })
        : new Response(JSON.stringify(sampleApplications), { status: 200 }),
    ),
  )
  renderView()
  await screen.findByRole('button', { name: /Acme/ })

  await addApplication(user)

  expect(await screen.findByText('Application added')).toBeVisible()
})

test('a failed add shows the server error message', async () => {
  const user = userEvent.setup()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'POST'
        ? new Response(JSON.stringify({ error: 'Company is required' }), {
            status: 400,
          })
        : new Response(JSON.stringify(sampleApplications), { status: 200 }),
    ),
  )
  renderView()
  await screen.findByRole('button', { name: /Acme/ })

  await addApplication(user)

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Company is required',
  )
})
