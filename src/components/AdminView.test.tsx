import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { AdminView } from './AdminView'
import { ToastProvider } from './ToastProvider'
import type { User } from '../types'

const users: User[] = [
  { id: 1, username: 'admin-user', role: 'admin' },
  { id: 2, username: 'basic-user', role: 'basic' },
]

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(typeof input === 'string' ? input : input.toString(), init),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderView(onUnauthorized = vi.fn()) {
  render(
    <ToastProvider>
      <AdminView onUnauthorized={onUnauthorized} />
    </ToastProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test('loads and renders the users from the API', async () => {
  stubFetch(() => new Response(JSON.stringify(users), { status: 200 }))
  renderView()

  expect(await screen.findByText('admin-user')).toBeVisible()
  expect(screen.getByText('basic-user')).toBeVisible()
})

test('creating a user posts it and reloads the list', async () => {
  const user = userEvent.setup()
  let created = false
  const fetchMock = stubFetch((_url, init) => {
    if (init?.method === 'POST') {
      created = true
      return new Response(JSON.stringify({ id: 3, username: 'new-user', role: 'basic' }), {
        status: 201,
      })
    }
    const listed = created
      ? [...users, { id: 3, username: 'new-user', role: 'basic' }]
      : users
    return new Response(JSON.stringify(listed), { status: 200 })
  })
  renderView()
  await screen.findByText('admin-user')

  await user.type(screen.getByRole('textbox', { name: 'Username' }), 'new-user')
  await user.type(screen.getByLabelText('Password'), 'new-password')
  await user.click(screen.getByRole('button', { name: 'Add user' }))

  expect(await screen.findByText('new-user')).toBeVisible()
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/users',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        username: 'new-user',
        password: 'new-password',
        role: 'basic',
      }),
    }),
  )
})

test('deleting a user calls the API and reloads', async () => {
  const user = userEvent.setup()
  let deleted = false
  stubFetch((_url, init) => {
    if (init?.method === 'DELETE') {
      deleted = true
      return new Response(null, { status: 204 })
    }
    const listed = deleted ? [users[0]] : users
    return new Response(JSON.stringify(listed), { status: 200 })
  })
  renderView()
  await screen.findByText('basic-user')

  await user.click(screen.getAllByRole('button', { name: 'Delete' })[1])
  await user.click(screen.getByRole('button', { name: 'Confirm delete' }))

  await waitFor(() => {
    expect(screen.queryByText('basic-user')).not.toBeInTheDocument()
  })
})

test('an expired session calls onUnauthorized', async () => {
  const onUnauthorized = vi.fn()
  stubFetch(
    () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }),
  )
  renderView(onUnauthorized)

  await waitFor(() => {
    expect(onUnauthorized).toHaveBeenCalled()
  })
})

test('a rejected change shows the error from the API', async () => {
  const user = userEvent.setup()
  stubFetch((_url, init) => {
    if (init?.method === 'PUT') {
      return new Response(JSON.stringify({ error: 'cannot demote the last admin' }), {
        status: 400,
      })
    }
    return new Response(JSON.stringify(users), { status: 200 })
  })
  renderView()
  await screen.findByText('admin-user')

  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Role for admin-user' }),
    'basic',
  )

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'cannot demote the last admin',
  )
})
