import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { ArchivedToggle } from './ArchivedToggle'

test('renders nothing when there is nothing archived', () => {
  const { container } = render(
    <ArchivedToggle count={0} showArchived={false} onChange={vi.fn()} />,
  )

  expect(container).toBeEmptyDOMElement()
})

test('the button offers to show the archived applications and names the count', () => {
  render(<ArchivedToggle count={4} showArchived={false} onChange={vi.fn()} />)

  expect(screen.getByRole('button', { name: 'Show 4 archived' })).toBeVisible()
})

test('the button offers to hide them once they are shown', () => {
  render(<ArchivedToggle count={4} showArchived onChange={vi.fn()} />)

  expect(screen.getByRole('button', { name: 'Hide archived' })).toBeVisible()
})

test('clicking the button reports the flipped value', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  const { rerender } = render(
    <ArchivedToggle count={2} showArchived={false} onChange={onChange} />,
  )

  await user.click(screen.getByRole('button', { name: 'Show 2 archived' }))
  expect(onChange).toHaveBeenCalledWith(true)

  rerender(<ArchivedToggle count={2} showArchived onChange={onChange} />)

  await user.click(screen.getByRole('button', { name: 'Hide archived' }))
  expect(onChange).toHaveBeenCalledWith(false)
})
