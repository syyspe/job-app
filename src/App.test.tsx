import { render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'
import type { Application, User } from './types'

const sampleUser: User = { id: 1, username: 'testuser' }

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
      if (url.endsWith('/api/applications')) {
        return new Response(JSON.stringify(sampleApplications), { status: 200 })
      }
      return new Response(null, { status: 404 })
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test('renders the login form when /api/me is 401', async () => {
  stubFetch(401)
  render(<App />)
  expect(
    await screen.findByRole('button', { name: 'Log in' }),
  ).toBeVisible()
})

test('renders the applications when /api/me succeeds', async () => {
  stubFetch(200)
  render(<App />)
  expect(
    await screen.findByRole('button', { name: /Acme/ }),
  ).toBeVisible()
})
