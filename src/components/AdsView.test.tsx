import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { AdsView } from './AdsView'
import { ToastProvider } from './ToastProvider'
import type { AdSummary, AgentRun } from '../types'

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
    prescreen: null,
    fetchRequestedAt: null,
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

function renderView(onUnauthorized = vi.fn(), canRunAgent = false, focusAdId?: number) {
  render(
    <ToastProvider>
      <AdsView onUnauthorized={onUnauthorized} canRunAgent={canRunAgent} focusAdId={focusAdId} />
    </ToastProvider>,
  )
}

// jsdom has no layout, so no scrollIntoView; AdRow scrolls a linked ad into view.
const scrolled = vi.fn()
Element.prototype.scrollIntoView = scrolled

afterEach(() => {
  vi.unstubAllGlobals()
  scrolled.mockClear()
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

test('a linked ad selects its state and is the current, scrolled-to row', async () => {
  const suitable = sampleAd({ id: 3, title: 'Kept ad', state: 'suitable', sourceMode: 'automatic' })
  const other = sampleAd({ id: 4, title: 'Other kept ad', state: 'suitable', sourceMode: 'automatic' })
  stubAds([waiting, suitable, other])
  renderView(vi.fn(), false, 3)

  const row = await screen.findByRole('listitem', { current: true })
  expect(within(row).getByText('Kept ad')).toBeVisible()
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  expect(screen.getByRole('button', { name: /^Suitable/ })).toHaveAttribute('aria-pressed', 'true')
  expect(scrolled).toHaveBeenCalledTimes(1)
})

test('the linked state is chosen once; the user can still change the filter', async () => {
  const user = userEvent.setup()
  stubAds([waiting, sampleAd({ id: 3, title: 'Kept ad', state: 'suitable', sourceMode: 'automatic' })])
  renderView(vi.fn(), false, 3)
  await screen.findByText('Kept ad')

  await user.click(screen.getByRole('button', { name: 'Awaiting hand-over 1' }))

  expect(await screen.findByText('Waiting ad')).toBeVisible()
  expect(screen.queryByRole('listitem', { current: true })).not.toBeInTheDocument()
})

test('a link to an ad that is not listed leaves the default state', async () => {
  stubAds([waiting])
  renderView(vi.fn(), false, 99)

  expect(await screen.findByText('Waiting ad')).toBeVisible()
  expect(screen.queryByRole('listitem', { current: true })).not.toBeInTheDocument()
})

test('a user without agent access sees no run panel', async () => {
  stubAds([waiting])
  renderView()
  await screen.findByText('Waiting ad')

  expect(screen.queryByRole('region', { name: 'Runs' })).not.toBeInTheDocument()
})

test('a user with agent access sees the run panel above the filter', async () => {
  stubFetch((url) =>
    url === '/api/agent/runs'
      ? new Response(JSON.stringify({ current: null, recent: [] }), { status: 200 })
      : new Response(JSON.stringify([waiting]), { status: 200 }),
  )
  renderView(vi.fn(), true)

  const panel = await screen.findByRole('region', { name: 'Runs' })
  expect(within(panel).getByRole('button', { name: 'Check mail' })).toBeVisible()
  const filter = screen.getByRole('group', { name: 'Filter ads by state' })
  expect(panel.compareDocumentPosition(filter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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
  ])
})

test('dismissed and duplicate ads are never listed', async () => {
  const user = userEvent.setup()
  stubAds([
    sampleAd({ id: 3, title: 'Dismissed ad', state: 'dismissed' }),
    sampleAd({ id: 4, title: 'Duplicate ad', state: 'duplicate', duplicateOf: 1 }),
  ])
  renderView()
  await screen.findByText('No ads in Awaiting hand-over')

  const group = within(screen.getByRole('group', { name: 'Filter ads by state' }))
  expect(group.queryByRole('button', { name: /^Dismissed/ })).not.toBeInTheDocument()
  expect(group.queryByRole('button', { name: /^Duplicate/ })).not.toBeInTheDocument()
  for (const button of group.getAllByRole('button')) {
    await user.click(button)
    expect(screen.queryByText('Dismissed ad')).not.toBeInTheDocument()
    expect(screen.queryByText('Duplicate ad')).not.toBeInTheDocument()
  }
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

test('Fetch posts the request and confirms it', async () => {
  const user = userEvent.setup()
  const fetchMock = stubAds([waiting])
  renderView()
  await screen.findByText('Waiting ad')

  await user.click(screen.getByRole('button', { name: 'Fetch' }))

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith('/api/ads/1/fetch-request', expect.objectContaining({ method: 'POST' })),
  )
  expect(await screen.findByText('Fetch requested')).toBeVisible()
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

const kept = sampleAd({ id: 3, title: 'Kept ad', state: 'suitable', sourceMode: 'automatic' })
const otherKept = sampleAd({ id: 4, title: 'Other kept ad', state: 'suitable', sourceMode: 'automatic' })

const draftRun: AgentRun = {
  id: 9,
  kind: 'draft',
  adId: 3,
  startedAt: '2026-11-27T08:00:00.000Z',
  finishedAt: null,
  exitCode: null,
  output: '',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

// The ads listing, an empty runs listing, and a POST that starts the draft run.
function stubAgent(ads: AdSummary[]) {
  return stubFetch((url, init) => {
    if (url !== '/api/agent/runs') return json(ads)
    if (init?.method === 'POST') return json(draftRun, 201)
    return json({ current: null, recent: [] })
  })
}

test('clicking Draft posts a draft run for that ad', async () => {
  const user = userEvent.setup()
  const fetchMock = stubAgent([kept])
  renderView(vi.fn(), true, 3)
  const row = await screen.findByRole('listitem', { current: true })

  await user.click(within(row).getByRole('button', { name: 'Draft' }))

  expect(fetchMock).toHaveBeenCalledWith(
    '/api/agent/runs',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ kind: 'draft', adId: 3 }) }),
  )
})

test('while the draft runs its row shows Drafting…, and other suitable rows wait', async () => {
  const user = userEvent.setup()
  stubAgent([kept, otherKept])
  renderView(vi.fn(), true, 3)
  const row = await screen.findByRole('listitem', { current: true })

  await user.click(within(row).getByRole('button', { name: 'Draft' }))

  expect(await within(row).findByText('Drafting…')).toBeVisible()
  expect(within(row).queryAllByRole('button')).toEqual([])
  const other = screen.getByText('Other kept ad').closest('li') as HTMLElement
  expect(within(other).getByRole('button', { name: 'Draft' })).toBeDisabled()
})

test('without agent access there is no Draft button and no runs request', async () => {
  const fetchMock = stubAds([kept])
  renderView(vi.fn(), false, 3)
  await screen.findByText('Kept ad')

  expect(screen.queryByRole('button', { name: 'Draft' })).toBeNull()
  expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain('/api/agent/runs')
})
