import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { AgentRunPanel } from '../components/AgentRunPanel'
import { ToastProvider } from '../components/ToastProvider'
import { useAgentRuns } from './useAgentRuns'
import type { AgentRun, AgentRuns } from '../types'

function sampleRun(overrides: Partial<AgentRun>): AgentRun {
  return {
    id: 1,
    kind: 'collect',
    adId: null,
    startedAt: '2026-11-26T08:00:00.000Z',
    finishedAt: null,
    exitCode: null,
    output: '',
    ...overrides,
  }
}

const running = sampleRun({ output: 'reading mail\n' })
const finished = sampleRun({ finishedAt: '2026-11-26T08:01:00.000Z', exitCode: 0, output: 'collected 2 ads\n' })

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

// Each GET answers with the next listing, the last one repeating.
function stubRuns(listings: AgentRuns[], onPost: () => Response = () => json(running, 201)) {
  let gets = 0
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') return onPost()
    return json(listings[Math.min(gets++, listings.length - 1)])
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

interface HarnessProps {
  enabled: boolean
  onUnauthorized: () => void
  onRunFinished: () => void
}

// The callbacks are made once, outside, as AdsView's are stable.
function Harness(props: HarnessProps) {
  const { runs, start } = useAgentRuns(props)
  return <AgentRunPanel runs={runs} onStart={(kind) => void start({ kind })} />
}

function renderHarness(enabled = true) {
  const onRunFinished = vi.fn()
  render(
    <ToastProvider>
      <Harness enabled={enabled} onUnauthorized={vi.fn()} onRunFinished={onRunFinished} />
    </ToastProvider>,
  )
  return onRunFinished
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

test('Check mail posts a collect run and shows it as current', async () => {
  const user = userEvent.setup()
  const fetchMock = stubRuns([{ current: null, recent: [] }])
  renderHarness()
  await screen.findByText('No runs yet. Check mail to start one.')

  await user.click(screen.getByRole('button', { name: 'Check mail' }))

  expect(fetchMock).toHaveBeenCalledWith('/api/agent/runs', expect.objectContaining({ method: 'POST', body: '{"kind":"collect"}' }))
  expect(await screen.findByRole('log', { name: 'Current run output' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Check mail' })).toBeDisabled()
})

test('polls while a run is current, then reports it finished under recent runs', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  stubRuns([
    { current: running, recent: [] },
    { current: running, recent: [] },
    { current: null, recent: [finished] },
  ])
  const onRunFinished = renderHarness()
  await screen.findByRole('log', { name: 'Current run output' })

  await act(() => vi.advanceTimersByTimeAsync(3000))
  expect(onRunFinished).not.toHaveBeenCalled()
  await act(() => vi.advanceTimersByTimeAsync(3000))

  expect(onRunFinished).toHaveBeenCalledTimes(1)
  const item = within(screen.getByRole('list', { name: 'Recent runs' })).getByRole('listitem')
  expect(item).toHaveTextContent('Mail check')
  expect(item).toHaveTextContent('Succeeded')
  expect(screen.queryByRole('log')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Run now' })).toBeEnabled()
})

test('a failed poll shows the error and polling carries on', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  let gets = 0
  const replies = [
    () => json({ current: running, recent: [] }),
    () => json({ error: 'internal server error' }, 500),
    () => json({ current: null, recent: [finished] }),
  ]
  vi.stubGlobal('fetch', vi.fn(async () => replies[Math.min(gets++, replies.length - 1)]()))
  const onRunFinished = renderHarness()
  await screen.findByRole('log', { name: 'Current run output' })

  await act(() => vi.advanceTimersByTimeAsync(3000))
  expect(await screen.findByText('internal server error')).toBeVisible()
  await act(() => vi.advanceTimersByTimeAsync(3000))

  expect(onRunFinished).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Run now' })).toBeEnabled()
})

test('a run already in progress shows the error toast', async () => {
  const user = userEvent.setup()
  stubRuns([{ current: null, recent: [] }], () => json({ error: 'a run is already in progress' }, 409))
  renderHarness()
  await screen.findByText('No runs yet. Check mail to start one.')

  await user.click(screen.getByRole('button', { name: 'Run now' }))

  expect(await screen.findByText('a run is already in progress')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Run now' })).toBeEnabled()
})

test('disabled, nothing is fetched', async () => {
  const fetchMock = stubRuns([{ current: running, recent: [] }])
  renderHarness(false)

  await act(() => Promise.resolve())

  expect(fetchMock).not.toHaveBeenCalled()
})
