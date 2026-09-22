import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'
import { ToastProvider } from './components/ToastProvider'
import type { Application, User } from './types'

const sampleUser: User = { id: 1, username: 'testuser', role: 'admin' }
const basicUser: User = { id: 2, username: 'basic-user', role: 'basic' }

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

function stubFetch(meStatus: number, me: User = sampleUser) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.endsWith('/api/me')) {
        return meStatus === 200
          ? new Response(JSON.stringify(me), { status: 200 })
          : new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
      }
      if (url.endsWith('/api/users')) {
        return new Response(JSON.stringify([me]), { status: 200 })
      }
      if (url.endsWith('/api/login')) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
        })
      }
      if (url.endsWith('/api/applications')) {
        return new Response(JSON.stringify(sampleApplications), { status: 200 })
      }
      return new Response(null, { status: 404 })
    }),
  )
}

function renderApp() {
  render(
    <ToastProvider>
      <App />
    </ToastProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test('renders the login form when /api/me is 401', async () => {
  stubFetch(401)
  renderApp()
  expect(
    await screen.findByRole('button', { name: 'Log in' }),
  ).toBeVisible()
})

test('renders the applications when /api/me succeeds', async () => {
  stubFetch(200)
  renderApp()
  expect(
    await screen.findByRole('button', { name: /Acme/ }),
  ).toBeVisible()
})

test('a failed login shows an error toast', async () => {
  const user = userEvent.setup()
  stubFetch(401)
  renderApp()

  await user.type(
    await screen.findByRole('textbox', { name: 'Username' }),
    'testuser',
  )
  await user.type(screen.getByLabelText('Password'), 'wrong')
  await user.click(screen.getByRole('button', { name: 'Log in' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Invalid username or password',
  )
})

test('an admin can switch to the admin view and back', async () => {
  const user = userEvent.setup()
  stubFetch(200)
  renderApp()

  await user.click(await screen.findByRole('button', { name: 'Admin' }))
  expect(await screen.findByRole('heading', { name: 'Add a user' })).toBeVisible()

  await user.click(screen.getByRole('button', { name: 'Applications' }))
  expect(
    await screen.findByRole('heading', { name: 'Add an application' }),
  ).toBeVisible()
})

test('a basic user gets the applications view and no admin control', async () => {
  stubFetch(200, basicUser)
  renderApp()

  expect(await screen.findByRole('button', { name: /Acme/ })).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Admin' })).not.toBeInTheDocument()
})
