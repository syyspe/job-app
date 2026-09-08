import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { ToastHost } from './ToastHost'
import type { Toast } from '../lib/toast'

const successToast: Toast = { id: 1, kind: 'success', message: 'Application added' }
const errorToast: Toast = { id: 2, kind: 'error', message: 'Company is required' }

test('a success toast announces politely', () => {
  render(<ToastHost toasts={[successToast]} onDismiss={vi.fn()} />)
  expect(screen.getByText('Application added').closest('[aria-live]')).toHaveAttribute(
    'aria-live',
    'polite',
  )
})

test('an error toast renders as an alert', () => {
  render(<ToastHost toasts={[errorToast]} onDismiss={vi.fn()} />)
  expect(screen.getByRole('alert')).toHaveTextContent('Company is required')
})

test('clicking dismiss calls onDismiss with the toast id', async () => {
  const user = userEvent.setup()
  const onDismiss = vi.fn()
  render(<ToastHost toasts={[successToast, errorToast]} onDismiss={onDismiss} />)

  await user.click(
    screen.getByRole('button', { name: 'Dismiss: Company is required' }),
  )

  expect(onDismiss).toHaveBeenCalledWith(2)
})
