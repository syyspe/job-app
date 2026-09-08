import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'
import { ToastProvider } from './components/ToastProvider'
import type { Application, User } from './types'

const sampleUser: User = { id: 1, username: 'testuser' }

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

function stubFetch(meStatus: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.endsWith('/api/me')) {
        return meStatus === 200
          ? new Response(JSON.stringify(sampleUser), { status: 200 })
          : new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
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
