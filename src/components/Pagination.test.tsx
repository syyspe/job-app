import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { Pagination } from './Pagination'

test('renders nothing when everything fits on one page', () => {
  const { container } = render(<Pagination label="Run pages" unit="Run" page={1} pageCount={1} onChange={vi.fn()} />)

  expect(container).toBeEmptyDOMElement()
})

test('names the position in the list with the given unit', () => {
  render(<Pagination label="Run pages" unit="Run" page={2} pageCount={4} onChange={vi.fn()} />)

  expect(screen.getByText('Run 2 of 4')).toBeVisible()
})

test('the navigation is named by the given label', () => {
  render(<Pagination label="Run pages" unit="Run" page={2} pageCount={4} onChange={vi.fn()} />)

  expect(screen.getByRole('navigation', { name: 'Run pages' })).toBeVisible()
})

test('Previous is disabled on the first page', () => {
  render(<Pagination label="Run pages" unit="Run" page={1} pageCount={4} onChange={vi.fn()} />)

  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
})

test('Next is disabled on the last page', () => {
  render(<Pagination label="Run pages" unit="Run" page={4} pageCount={4} onChange={vi.fn()} />)

  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()
})

test('each button reports the page it moves to', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(<Pagination label="Run pages" unit="Run" page={2} pageCount={4} onChange={onChange} />)

  await user.click(screen.getByRole('button', { name: 'Next' }))
  expect(onChange).toHaveBeenCalledWith(3)

  await user.click(screen.getByRole('button', { name: 'Previous' }))
  expect(onChange).toHaveBeenCalledWith(1)
})
