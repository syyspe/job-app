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
    archived: false,
    createdAt: '2026-01-15 09:00:00',
    updatedAt: '2026-01-15 09:00:00',
    attachments: [],
  },
]

interface StubOptions {
  pageSize?: number
  post?: () => Response
}

// Every test needs /api/config answered as well as /api/applications, so the
// stub routes by URL rather than returning the same body to everything.
function stubFetch(applications: Application[], { pageSize = 10, post }: StubOptions = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST' && post) return post()
    if (String(input) === '/api/config') {
      return new Response(JSON.stringify({ pageSize }), { status: 200 })
    }
    return new Response(JSON.stringify(applications), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

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
  stubFetch(sampleApplications)
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
  stubFetch(outOfOrder)
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
  stubFetch(sampleApplications, {
    post: () => new Response(JSON.stringify(sampleApplications[0]), { status: 201 }),
  })
  renderView()
  await screen.findByRole('button', { name: /Acme/ })

  await addApplication(user)

  expect(await screen.findByText('Application added')).toBeVisible()
})

test('a failed add shows the server error message', async () => {
  const user = userEvent.setup()
  stubFetch(sampleApplications, {
    post: () =>
      new Response(JSON.stringify({ error: 'Company is required' }), { status: 400 }),
  })
  renderView()
  await screen.findByRole('button', { name: /Acme/ })

  await addApplication(user)

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Company is required',
  )
})

const mixedApplications: Application[] = [
  { ...sampleApplications[0], id: 1, company: 'Acme' },
  { ...sampleApplications[0], id: 2, company: 'Globex', archived: true },
]

test('archived applications stay hidden until the toggle reveals them', async () => {
  const user = userEvent.setup()
  stubFetch(mixedApplications)
  renderView()
  await screen.findByRole('button', { name: /Acme/ })

  expect(screen.queryByRole('button', { name: /Globex/ })).not.toBeInTheDocument()

  // The toggle's name changes with its state, so each click needs a fresh query.
  await user.click(screen.getByRole('button', { name: 'Show 1 archived' }))
  expect(screen.getByRole('button', { name: /Globex/ })).toBeVisible()
  expect(screen.getByRole('button', { name: /Acme/ })).toBeVisible()

  await user.click(screen.getByRole('button', { name: 'Hide archived' }))
  expect(screen.queryByRole('button', { name: /Globex/ })).not.toBeInTheDocument()
})

test('with nothing archived there is no archived toggle at all', async () => {
  stubFetch(sampleApplications)
  renderView()
  await screen.findByRole('button', { name: /Acme/ })

  expect(screen.queryByRole('button', { name: /archived$/ })).not.toBeInTheDocument()
})

test('with every application archived the surface says so and offers to reveal them', async () => {
  const user = userEvent.setup()
  const allArchived = mixedApplications.map((application) => ({
    ...application,
    archived: true,
  }))
  stubFetch(allArchived)
  renderView()

  expect(await screen.findByText('Nothing to show')).toBeVisible()
  expect(screen.getByText('2 archived applications are hidden.')).toBeVisible()

  await user.click(screen.getByRole('button', { name: 'Show 2 archived' }))
  expect(screen.getByRole('button', { name: /Acme/ })).toBeVisible()
  expect(screen.getByRole('button', { name: /Globex/ })).toBeVisible()
})

test('archiving a row asks the API to archive it', async () => {
  const user = userEvent.setup()
  const fetchMock = stubFetch(mixedApplications)
  renderView()
  const row = await screen.findByRole('button', { name: /Acme/ })

  await user.click(row)
  await user.click(screen.getByRole('button', { name: 'Archive' }))

  expect(fetchMock).toHaveBeenCalledWith(
    '/api/applications/1/archived',
    expect.objectContaining({ method: 'PUT', body: JSON.stringify({ archived: true }) }),
  )
})

// Created oldest-first, so under the default sort Company 5 is the top row.
function makeApplications(count: number): Application[] {
  return Array.from({ length: count }, (_, index) => ({
    ...sampleApplications[0],
    id: index + 1,
    company: `Company ${index + 1}`,
    createdAt: `2026-01-0${index + 1} 09:00:00`,
  }))
}

async function goToPageTwo(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Next' }))
  expect(screen.getByText('Page 2 of 3')).toBeVisible()
}

test('a list longer than a page renders one page at a time', async () => {
  const user = userEvent.setup()
  stubFetch(makeApplications(5), { pageSize: 2 })
  renderView()

  await screen.findByRole('button', { name: /Company 5/ })
  expect(screen.getByRole('button', { name: /Company 4/ })).toBeVisible()
  expect(screen.queryByRole('button', { name: /Company 3/ })).not.toBeInTheDocument()
  expect(screen.getByText('Page 1 of 3')).toBeVisible()

  await user.click(screen.getByRole('button', { name: 'Next' }))

  expect(screen.getByRole('button', { name: /Company 3/ })).toBeVisible()
  expect(screen.queryByRole('button', { name: /Company 5/ })).not.toBeInTheDocument()
})

test('a list that fits on one page has no pager', async () => {
  stubFetch(makeApplications(2), { pageSize: 2 })
  renderView()

  await screen.findByRole('button', { name: /Company 2/ })
  expect(screen.queryByRole('navigation', { name: 'Application pages' })).not.toBeInTheDocument()
})

test('changing the sort returns to page 1', async () => {
  const user = userEvent.setup()
  stubFetch(makeApplications(5), { pageSize: 2 })
  renderView()
  await screen.findByRole('button', { name: /Company 5/ })

  await goToPageTwo(user)
  await user.click(screen.getByRole('button', { name: 'Sort oldest first' }))

  expect(screen.getByText('Page 1 of 3')).toBeVisible()
  expect(screen.getByRole('button', { name: /Company 1/ })).toBeVisible()
})

test('revealing the archived applications returns to page 1 and counts them all', async () => {
  const user = userEvent.setup()
  const applications = makeApplications(6)
  applications[0] = { ...applications[0], archived: true }
  stubFetch(applications, { pageSize: 2 })
  renderView()
  await screen.findByRole('button', { name: /Company 6/ })

  await goToPageTwo(user)
  // Company 1 is archived and sorts last, so the count spans more than this page.
  await user.click(screen.getByRole('button', { name: 'Show 1 archived' }))

  expect(screen.getByText('Page 1 of 3')).toBeVisible()
})

test('adding an application returns to page 1', async () => {
  const user = userEvent.setup()
  const applications = makeApplications(5)
  stubFetch(applications, {
    pageSize: 2,
    post: () => new Response(JSON.stringify(applications[0]), { status: 201 }),
  })
  renderView()
  await screen.findByRole('button', { name: /Company 5/ })

  await goToPageTwo(user)
  await addApplication(user)

  expect(await screen.findByText('Page 1 of 3')).toBeVisible()
})
