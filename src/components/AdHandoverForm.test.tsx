import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { AdHandoverForm } from './AdHandoverForm'

test('starts from the title and company the ad already has', () => {
  render(
    <AdHandoverForm title="Test Lead" company="Acme" onSubmit={vi.fn()} onCancel={vi.fn()} />,
  )

  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Test Lead')
  expect(screen.getByRole('textbox', { name: 'Company' })).toHaveValue('Acme')
})

test('submits the text with the edited fields', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn()
  render(<AdHandoverForm title="" company="" onSubmit={onSubmit} onCancel={vi.fn()} />)

  await user.type(screen.getByRole('textbox', { name: 'Ad text' }), 'The full ad.')
  await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Test Lead')
  await user.type(screen.getByRole('textbox', { name: 'Company' }), 'Acme')
  await user.click(screen.getByRole('button', { name: 'Hand over ad' }))

  expect(onSubmit).toHaveBeenCalledWith({
    text: 'The full ad.',
    title: 'Test Lead',
    company: 'Acme',
  })
})

test('the ad text is required', () => {
  render(<AdHandoverForm title="" company="" onSubmit={vi.fn()} onCancel={vi.fn()} />)

  expect(screen.getByRole('textbox', { name: 'Ad text' })).toBeRequired()
})

test('cancel leaves without submitting', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn()
  const onCancel = vi.fn()
  render(<AdHandoverForm title="" company="" onSubmit={onSubmit} onCancel={onCancel} />)

  await user.click(screen.getByRole('button', { name: 'Cancel' }))

  expect(onCancel).toHaveBeenCalled()
  expect(onSubmit).not.toHaveBeenCalled()
})
