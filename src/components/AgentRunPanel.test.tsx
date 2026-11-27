import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { AgentRunPanel } from './AgentRunPanel'
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

function renderPanel(runs: AgentRuns) {
  const onStart = vi.fn()
  render(<AgentRunPanel runs={runs} onStart={onStart} />)
  return onStart
}

test('the buttons are disabled while a run is current, and its output is shown', () => {
  renderPanel({ current: running, recent: [] })

  expect(screen.getByRole('log', { name: 'Current run output' })).toHaveTextContent('reading mail')
  expect(screen.getByText(/^Running: Mail check, started/)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Run now' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Check mail' })).toBeDisabled()
})

test('a current draft run is labelled Draft', () => {
  renderPanel({ current: sampleRun({ kind: 'draft', adId: 7 }), recent: [] })

  expect(screen.getByText(/^Running: Draft, started/)).toBeVisible()
})

test.each([
  ['Run now', 'run'],
  ['Check mail', 'collect'],
])('%s calls onStart with %s', async (name, kind) => {
  const user = userEvent.setup()
  const onStart = renderPanel({ current: null, recent: [] })
  expect(screen.getByText('No runs yet. Check mail to start one.')).toBeVisible()

  await user.click(screen.getByRole('button', { name }))

  expect(onStart).toHaveBeenCalledWith(kind)
})

test('a finished run shows its outcome, the newest with its output open', () => {
  renderPanel({
    current: null,
    recent: [sampleRun({ id: 3, kind: 'run', finishedAt: '2026-11-26T09:00:00.000Z', exitCode: 1 }), finished],
  })

  const items = within(screen.getByRole('list', { name: 'Recent runs' })).getAllByRole('listitem')
  expect(items.map((item) => item.getAttribute('data-outcome'))).toEqual(['failed', 'succeeded'])
  expect(items[0]).toHaveTextContent('Daily run')
  expect(items[0]).toHaveTextContent('Failed')
  expect(items[0].querySelector('details')).toHaveAttribute('open')
  expect(items[1].querySelector('details')).not.toHaveAttribute('open')
  expect(within(items[1]).getByText('collected 2 ads')).toBeInTheDocument()
})

test('a run whose output ends with the api line shows its spend, a collect run shows none', () => {
  const daily = sampleRun({
    id: 3,
    kind: 'run',
    finishedAt: '2026-11-26T09:00:00.000Z',
    exitCode: 0,
    output: 'summary: sent\napi: $0.42 run, $4.12 month\n',
  })
  renderPanel({ current: null, recent: [daily, finished] })

  const items = within(screen.getByRole('list', { name: 'Recent runs' })).getAllByRole('listitem')
  expect(within(items[0]).getByText('API $0.42 run, $4.12 month')).toBeVisible()
  expect(items[1]).not.toHaveTextContent('API $')
})
