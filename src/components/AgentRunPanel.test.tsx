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

const failedDaily = sampleRun({ id: 3, kind: 'run', finishedAt: '2026-11-26T09:00:00.000Z', exitCode: 1 })

function recentItems() {
  return within(screen.getByRole('list', { name: 'Recent runs' })).getAllByRole('listitem')
}

test('a current run replaces the recent runs and their pager', () => {
  renderPanel({ current: running, recent: [failedDaily, finished] })

  expect(screen.getByRole('log', { name: 'Current run output' })).toBeVisible()
  expect(screen.queryByRole('list', { name: 'Recent runs' })).not.toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Run pages' })).not.toBeInTheDocument()
})

test('a finished run shows its outcome, one run at a time with its output open', async () => {
  const user = userEvent.setup()
  renderPanel({ current: null, recent: [failedDaily, finished] })

  let items = recentItems()
  expect(items).toHaveLength(1)
  expect(items[0]).toHaveAttribute('data-outcome', 'failed')
  expect(items[0]).toHaveTextContent('Daily run')
  expect(items[0]).toHaveTextContent('Failed')
  expect(items[0].querySelector('details')).toHaveAttribute('open')
  expect(screen.getByText('Run 1 of 2')).toBeVisible()

  await user.click(screen.getByRole('button', { name: 'Next' }))

  items = recentItems()
  expect(items).toHaveLength(1)
  expect(items[0]).toHaveAttribute('data-outcome', 'succeeded')
  expect(items[0].querySelector('details')).toHaveAttribute('open')
  expect(within(items[0]).getByText('collected 2 ads')).toBeVisible()
  expect(screen.getByText('Run 2 of 2')).toBeVisible()

  await user.click(screen.getByRole('button', { name: 'Previous' }))

  expect(recentItems()[0]).toHaveAttribute('data-outcome', 'failed')
})

test('a single recent run has no pager', () => {
  renderPanel({ current: null, recent: [finished] })

  expect(recentItems()).toHaveLength(1)
  expect(screen.queryByRole('navigation', { name: 'Run pages' })).not.toBeInTheDocument()
})

test('a run whose output ends with the api line shows its spend, a collect run shows none', async () => {
  const user = userEvent.setup()
  const daily = sampleRun({
    id: 3,
    kind: 'run',
    finishedAt: '2026-11-26T09:00:00.000Z',
    exitCode: 0,
    output: 'summary: sent\napi: $0.42 run, $4.12 month\n',
  })
  renderPanel({ current: null, recent: [daily, finished] })

  expect(within(recentItems()[0]).getByText('API $0.42 run, $4.12 month')).toBeVisible()

  await user.click(screen.getByRole('button', { name: 'Next' }))

  expect(recentItems()[0]).not.toHaveTextContent('API $')
})

test('after a run finishes the pager starts back at the newest run', async () => {
  const user = userEvent.setup()
  const onStart = vi.fn()
  const { rerender } = render(<AgentRunPanel runs={{ current: null, recent: [failedDaily, finished] }} onStart={onStart} />)
  await user.click(screen.getByRole('button', { name: 'Next' }))
  expect(screen.getByText('Run 2 of 2')).toBeVisible()

  rerender(<AgentRunPanel runs={{ current: running, recent: [failedDaily, finished] }} onStart={onStart} />)
  rerender(<AgentRunPanel runs={{ current: null, recent: [failedDaily, finished] }} onStart={onStart} />)

  expect(screen.getByText('Run 1 of 2')).toBeVisible()
  expect(recentItems()[0]).toHaveAttribute('data-outcome', 'failed')
})
