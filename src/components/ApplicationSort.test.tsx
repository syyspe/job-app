import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { ApplicationSort } from './ApplicationSort'
import type { Sort } from '../lib/sorting'

test('the select has an accessible name and shows the field in effect', () => {
  const sort: Sort = { field: 'createdAt', direction: 'desc' }
  render(<ApplicationSort sort={sort} onChange={vi.fn()} />)

  expect(screen.getByRole('combobox', { name: 'Sort by' })).toHaveValue('createdAt')
})

test('choosing a field calls onChange with the new field', async () => {
  const user = userEvent.setup()
  const sort: Sort = { field: 'createdAt', direction: 'desc' }
  const onChange = vi.fn()
  render(<ApplicationSort sort={sort} onChange={onChange} />)

  await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'deadline')

  expect(onChange).toHaveBeenCalledWith({ field: 'deadline', direction: 'desc' })
})

test('the direction button offers the order not in effect, worded per field', () => {
  const { rerender } = render(
    <ApplicationSort sort={{ field: 'createdAt', direction: 'desc' }} onChange={vi.fn()} />,
  )
  expect(screen.getByRole('button', { name: 'Sort oldest first' })).toBeVisible()

  rerender(
    <ApplicationSort sort={{ field: 'deadline', direction: 'asc' }} onChange={vi.fn()} />,
  )
  expect(screen.getByRole('button', { name: 'Sort latest first' })).toBeVisible()

  rerender(
    <ApplicationSort sort={{ field: 'status', direction: 'asc' }} onChange={vi.fn()} />,
  )
  expect(screen.getByRole('button', { name: 'Sort latest stage first' })).toBeVisible()
})

test('clicking the direction button calls onChange with the flipped direction', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(
    <ApplicationSort sort={{ field: 'deadline', direction: 'asc' }} onChange={onChange} />,
  )

  await user.click(screen.getByRole('button', { name: 'Sort latest first' }))

  expect(onChange).toHaveBeenCalledWith({ field: 'deadline', direction: 'desc' })
})
