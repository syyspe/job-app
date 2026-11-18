import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { AdsView } from './AdsView'
import { ToastProvider } from './ToastProvider'
import type { AdSummary } from '../types'

function sampleAd(overrides: Partial<AdSummary>): AdSummary {
  return {
    id: 1,
    source: 'duunitori',
    sourceMode: 'handover',
    externalId: 'abc',
    url: 'https://example.com/ad/1',
    title: 'Waiting ad',
    company: 'Acme',
    location: '',
    deadline: '',
    state: 'awaiting_handover',
    evaluation: null,
    applicationId: null,
    duplicateOf: null,
    attempts: 0,
    lastError: null,
    firstSeenAt: '2026-11-01 08:00:00',
    updatedAt: '2026-11-01 08:00:00',
    reportedAt: null,
    ...overrides,
  }
}

const waiting = sampleAd({})
const failed = sampleAd({
  id: 2,
  title: 'Failed ad',
  state: 'failed',
  sourceMode: 'automatic',
  lastError: 'gone',
})

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(typeof input === 'string' ? input : input.toString(), init),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function stubAds(ads: AdSummary[]) {
  return stubFetch(() => new Response(JSON.stringify(ads), { status: 200 }))
}

function renderView(onUnauthorized = vi.fn()) {
  render(
    <ToastProvider>
      <AdsView onUnauthorized={onUnauthorized} />
    </ToastProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test('opens on the ads waiting for a hand-over', async () => {
  stubAds([waiting, failed])
  renderView()

  expect(await screen.findByText('Waiting ad')).toBeVisible()
  expect(screen.queryByText('Failed ad')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Awaiting hand-over 1' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('orders the state filters by urgency', async () => {
  stubAds([])
  renderView()
  await screen.findByText('No ads in Awaiting hand-over')

  const filters = within(screen.getByRole('group', { name: 'Filter ads by state' }))
    .getAllByRole('button')
    .map((button) => button.textContent)
  expect(filters).toEqual([
    'Awaiting hand-over 0',
    'Failed 0',
    'Suitable 0',
    'Ready 0',
    'New 0',
    'Drafted 0',
    'Title rejected 0',
    'Unsuitable 0',
    'Duplicate 0',
    'Dismissed 0',
  ])
})

test('a state filter shows that state', async () => {
  const user = userEvent.setup()
  stubAds([waiting, failed])
  renderView()
  await screen.findByText('Waiting ad')

  await user.click(screen.getByRole('button', { name: 'Failed 1' }))

  expect(screen.getByText('Failed ad')).toBeVisible()
  expect(screen.queryByText('Waiting ad')).not.toBeInTheDocument()
})

test('retrying posts the target for the ad mode and reloads', async () => {
  const user = userEvent.setup()
  const fetchMock = stubFetch((_url, init) =>
    init?.method === 'POST'
      ? new Response(JSON.stringify(failed), { status: 200 })
      : new Response(JSON.stringify([failed]), { status: 200 }),
  )
  renderView()
  await user.click(await screen.findByRole('button', { name: 'Failed 1' }))

  await user.click(screen.getByRole('button', { name: 'Retry' }))

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ads/2/transition',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ to: 'new' }) }),
    ),
  )
  expect(await screen.findByText('Ad sent back for another try')).toBeVisible()
})

test('dismissing posts the transition', async () => {
  const user = userEvent.setup()
  const fetchMock = stubAds([waiting])
  renderView()
  await screen.findByText('Waiting ad')

  await user.click(screen.getByRole('button', { name: 'Dismiss' }))
  await user.click(screen.getByRole('button', { name: 'Confirm dismiss' }))

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ads/1/transition',
      expect.objectContaining({ body: JSON.stringify({ to: 'dismissed' }) }),
    ),
  )
})

test('handing over posts the text', async () => {
  const user = userEvent.setup()
  const fetchMock = stubAds([waiting])
  renderView()
  await screen.findByText('Waiting ad')

  await user.click(screen.getByRole('button', { name: 'Hand over' }))
  await user.type(screen.getByRole('textbox', { name: 'Ad text' }), 'The full ad.')
  await user.click(screen.getByRole('button', { name: 'Hand over ad' }))

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ads/1/handover',
      expect.objectContaining({
        body: JSON.stringify({ text: 'The full ad.', title: 'Waiting ad', company: 'Acme' }),
      }),
    ),
  )
})

test('a refused change shows the error from the API', async () => {
  const user = userEvent.setup()
  stubFetch((_url, init) =>
    init?.method === 'POST'
      ? new Response(JSON.stringify({ error: 'an ad cannot move' }), { status: 409 })
      : new Response(JSON.stringify([waiting]), { status: 200 }),
  )
  renderView()
  await screen.findByText('Waiting ad')

  await user.click(screen.getByRole('button', { name: 'Dismiss' }))
  await user.click(screen.getByRole('button', { name: 'Confirm dismiss' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('an ad cannot move')
})

test('an expired session calls onUnauthorized', async () => {
  const onUnauthorized = vi.fn()
  stubFetch(() => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }))
  renderView(onUnauthorized)

  await waitFor(() => expect(onUnauthorized).toHaveBeenCalled())
})
