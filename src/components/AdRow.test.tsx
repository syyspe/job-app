import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { AdRow } from './AdRow'
import type { AdActions } from './AdRow'
import type { DraftStatus } from '../lib/adStates'
import type { AdState, AdSummary } from '../types'

function sampleAd(overrides: Partial<AdSummary> = {}): AdSummary {
  return {
    id: 7,
    source: 'duunitori',
    sourceMode: 'handover',
    externalId: 'abc',
    url: 'https://example.com/ad/7',
    title: 'Test Lead',
    company: 'Acme',
    location: 'Helsinki',
    deadline: 'end of May',
    state: 'suitable',
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

function renderRow(ad: AdSummary, draft: DraftStatus = 'none') {
  const actions: AdActions = {
    onRetry: vi.fn(),
    onDraft: vi.fn(),
    onDismiss: vi.fn(),
  }
  render(
    <ul>
      <AdRow ad={ad} actions={actions} draft={draft} />
    </ul>,
  )
  return actions
}

test('shows what is known about the ad', () => {
  renderRow(sampleAd())
  const row = within(screen.getByRole('listitem'))

  expect(row.getByText('Test Lead')).toBeVisible()
  expect(row.getByText('Acme')).toBeVisible()
  expect(row.getByText('duunitori')).toBeVisible()
  expect(row.getByText('Helsinki')).toBeVisible()
  expect(row.getByText('Deadline end of May')).toBeVisible()
})

test('links to the ad without sending a referrer', () => {
  renderRow(sampleAd())

  const link = screen.getByRole('link', { name: 'Open ad' })
  expect(link).toHaveAttribute('href', 'https://example.com/ad/7')
  expect(link).toHaveAttribute('rel', 'noreferrer')
})

test('a blanked ad reads its source and first-seen date', () => {
  renderRow(sampleAd({ title: '', company: '' }))

  expect(screen.getByText('Duunitori ad · 1 Nov 2026')).toBeVisible()
  expect(screen.queryByText('Untitled ad')).not.toBeInTheDocument()
})

test('shows the fit summary when there is one', () => {
  renderRow(
    sampleAd({
      state: 'suitable',
      evaluation: { verdict: 'suitable', fitSummary: 'Strong match.', reasons: [] },
    }),
  )

  expect(screen.getByText('Strong match.')).toBeVisible()
})

test('shows the error category on a failed ad', () => {
  renderRow(sampleAd({ state: 'failed', lastError: 'fetch_failed' }))

  expect(screen.getByText('Failed with fetch_failed')).toBeVisible()
})

test.each<[AdState, boolean]>([
  ['suitable', true],
  ['failed', true],
  ['drafted', false],
  ['title_rejected', false],
  ['unsuitable', false],
])('in %s, offering dismiss is %s', (state, offered) => {
  renderRow(sampleAd({ state }))

  expect(screen.queryAllByRole('button', { name: 'Dismiss' })).toHaveLength(offered ? 1 : 0)
})

test('retry is offered on a failed ad only', async () => {
  const user = userEvent.setup()
  const ad = sampleAd({ state: 'failed', lastError: 'gone' })
  const actions = renderRow(ad)

  await user.click(screen.getByRole('button', { name: 'Retry' }))

  expect(actions.onRetry).toHaveBeenCalledWith(ad)
})

test('dismissing takes a confirmation', async () => {
  const user = userEvent.setup()
  const actions = renderRow(sampleAd())

  await user.click(screen.getByRole('button', { name: 'Dismiss' }))
  expect(actions.onDismiss).not.toHaveBeenCalled()

  await user.click(screen.getByRole('button', { name: 'Confirm dismiss' }))
  expect(actions.onDismiss).toHaveBeenCalledWith(7)
})

test('cancelling the confirmation keeps the ad', async () => {
  const user = userEvent.setup()
  const actions = renderRow(sampleAd())

  await user.click(screen.getByRole('button', { name: 'Dismiss' }))
  await user.click(screen.getByRole('button', { name: 'Cancel' }))

  expect(actions.onDismiss).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Dismiss' })).toBeVisible()
})

test('a kept ad keeps its pre-screen verdict and reason', () => {
  renderRow(sampleAd({ prescreen: { verdict: 'promising', reason: 'Lead role.' } }))

  expect(screen.getByText('Pre-screen: Promising — Lead role.')).toBeVisible()
})

test.each<[string, Partial<AdSummary>, string]>([
  ['the title rules', { state: 'title_rejected' }, 'Set aside by the title rules.'],
  [
    'the pre-screen',
    { state: 'dismissed', prescreen: { verdict: 'not_promising', reason: 'Mainly sales.' } },
    'Set aside by the pre-screen — Mainly sales.',
  ],
  [
    'the evaluation',
    { state: 'unsuitable', evaluation: { verdict: 'unsuitable', fitSummary: 'Too junior.', reasons: [] } },
    'Set aside by the evaluation — Too junior.',
  ],
])('an ad set aside by %s says so, and offers no buttons', (_step, overrides, sentence) => {
  renderRow(sampleAd(overrides))

  expect(screen.getByText(sentence)).toBeVisible()
  expect(screen.queryByText(/^Pre-screen:/)).toBeNull()
  expect(screen.queryAllByRole('button')).toEqual([])
})

test('a drafted ad offers no buttons', () => {
  renderRow(sampleAd({ state: 'drafted' }))

  expect(screen.queryAllByRole('button')).toEqual([])
})

test('a failed ad offers Retry and Dismiss', () => {
  renderRow(sampleAd({ state: 'failed', lastError: 'gone' }))

  const buttons = screen.getAllByRole('button').map((button) => button.textContent)
  expect(buttons).toEqual(['Retry', 'Dismiss'])
})

const suitable = sampleAd({ state: 'suitable', sourceMode: 'automatic' })

test('a ready suitable ad offers Draft before Dismiss, and clicking it calls onDraft', async () => {
  const user = userEvent.setup()
  const actions = renderRow(suitable, 'ready')

  const buttons = screen.getAllByRole('button').map((button) => button.textContent)
  expect(buttons).toEqual(['Draft', 'Dismiss'])
  await user.click(screen.getByRole('button', { name: 'Draft' }))

  expect(actions.onDraft).toHaveBeenCalledWith(7)
})

test('while another run is current, Draft is disabled', () => {
  renderRow(suitable, 'busy')

  expect(screen.getByRole('button', { name: 'Draft' })).toBeDisabled()
})

test('with draft none there is no Draft button', () => {
  renderRow(suitable)

  expect(screen.queryByRole('button', { name: 'Draft' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Dismiss' })).toBeVisible()
})

test('while its own draft runs, the row shows Drafting… and no buttons', () => {
  renderRow(suitable, 'running')

  expect(screen.getByText('Drafting…')).toBeVisible()
  expect(screen.queryAllByRole('button')).toEqual([])
})
