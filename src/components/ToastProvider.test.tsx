import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ToastProvider } from './ToastProvider'
import { MAX_TOASTS, TOAST_DURATIONS_MS, useToast } from '../lib/toast'

function Probe() {
  const { showSuccess, showError } = useToast()
  return (
    <>
      <button type="button" onClick={() => showSuccess('Saved')}>
        Succeed
      </button>
      <button type="button" onClick={() => showError('Boom')}>
        Fail
      </button>
    </>
  )
}

function renderProbe() {
  return render(
    <ToastProvider>
      <Probe />
    </ToastProvider>,
  )
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

test('showSuccess and showError put toasts on screen', async () => {
  const user = userEvent.setup()
  renderProbe()

  await user.click(screen.getByRole('button', { name: 'Succeed' }))
  await user.click(screen.getByRole('button', { name: 'Fail' }))

  expect(screen.getByText('Saved')).toBeVisible()
  expect(screen.getByText('Boom')).toBeVisible()
})

test('a success toast expires before an error toast', async () => {
  const user = userEvent.setup()
  renderProbe()

  await user.click(screen.getByRole('button', { name: 'Succeed' }))
  await user.click(screen.getByRole('button', { name: 'Fail' }))

  act(() => vi.advanceTimersByTime(TOAST_DURATIONS_MS.success))
  expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  expect(screen.getByText('Boom')).toBeVisible()

  act(() => vi.advanceTimersByTime(TOAST_DURATIONS_MS.error))
  expect(screen.queryByText('Boom')).not.toBeInTheDocument()
})

test('a toast can be dismissed early', async () => {
  const user = userEvent.setup()
  renderProbe()

  await user.click(screen.getByRole('button', { name: 'Succeed' }))
  await user.click(screen.getByRole('button', { name: 'Dismiss: Saved' }))

  expect(screen.queryByText('Saved')).not.toBeInTheDocument()
})

test('a burst beyond the cap drops the oldest toast', async () => {
  const user = userEvent.setup()
  renderProbe()

  for (let i = 0; i <= MAX_TOASTS; i += 1) {
    await user.click(screen.getByRole('button', { name: 'Fail' }))
  }

  expect(screen.getAllByRole('alert')).toHaveLength(MAX_TOASTS)
})
