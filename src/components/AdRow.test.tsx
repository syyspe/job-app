import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { AdRow } from './AdRow'
import type { AdActions } from './AdRow'
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

function renderRow(ad: AdSummary, handedOver = true) {
  const actions: AdActions = {
    onHandOver: vi.fn().mockResolvedValue(handedOver),
    onRetry: vi.fn(),
    onDismiss: vi.fn(),
  }
  render(
    <ul>
      <AdRow ad={ad} actions={actions} />
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

test('the link stays available while handing over, where the text is copied from', async () => {
  const user = userEvent.setup()
  renderRow(sampleAd())

  await user.click(screen.getByRole('button', { name: 'Hand over' }))

  expect(screen.getByRole('link', { name: 'Open ad' })).toBeVisible()
})

test('a blanked ad reads Untitled ad', () => {
  renderRow(sampleAd({ title: '', company: '' }))

  expect(screen.getByText('Untitled ad')).toBeVisible()
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
  ['awaiting_handover', true],
  ['title_rejected', true],
  ['new', false],
  ['ready', false],
  ['failed', false],
])('in %s, offering hand over is %s', (state, offered) => {
  renderRow(sampleAd({ state }))

  expect(screen.queryAllByRole('button', { name: 'Hand over' })).toHaveLength(offered ? 1 : 0)
})

test.each<[AdState, boolean]>([
  ['new', true],
  ['awaiting_handover', true],
  ['title_rejected', true],
  ['ready', true],
  ['suitable', true],
  ['failed', true],
  ['drafted', false],
  ['unsuitable', false],
  ['duplicate', false],
  ['dismissed', false],
])('in %s, offering dismiss is %s', (state, offered) => {
  renderRow(sampleAd({ state }))

  expect(screen.queryAllByRole('button', { name: 'Dismiss' })).toHaveLength(offered ? 1 : 0)
})

test('handing over submits the form and closes it', async () => {
  const user = userEvent.setup()
  const actions = renderRow(sampleAd())

  await user.click(screen.getByRole('button', { name: 'Hand over' }))
  await user.type(screen.getByRole('textbox', { name: 'Ad text' }), 'The full ad.')
  await user.click(screen.getByRole('button', { name: 'Hand over ad' }))

  expect(actions.onHandOver).toHaveBeenCalledWith(7, {
    text: 'The full ad.',
    title: 'Test Lead',
    company: 'Acme',
  })
  expect(screen.queryByRole('textbox', { name: 'Ad text' })).not.toBeInTheDocument()
})

test('a failed hand-over keeps the form and the pasted text', async () => {
  const user = userEvent.setup()
  renderRow(sampleAd(), false)

  await user.click(screen.getByRole('button', { name: 'Hand over' }))
  await user.type(screen.getByRole('textbox', { name: 'Ad text' }), 'The full ad.')
  await user.click(screen.getByRole('button', { name: 'Hand over ad' }))

  expect(await screen.findByRole('textbox', { name: 'Ad text' })).toHaveValue('The full ad.')
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
