import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import type { Application } from './types'

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

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(sampleApplications), { status: 200 }),
    ),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test('loads and renders applications from the API', async () => {
  render(<App />)
  expect(
    await screen.findByRole('button', { name: /Acme/ }),
  ).toBeVisible()
})
