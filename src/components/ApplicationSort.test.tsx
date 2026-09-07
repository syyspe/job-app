import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { ApplicationSort } from './ApplicationSort'
import type { Sort } from '../lib/sorting'

test('the select and the button have accessible names', () => {
  const sort: Sort = { field: 'createdAt', direction: 'desc' }
  render(<ApplicationSort sort={sort} onChange={vi.fn()} />)

  expect(screen.getByRole('combobox', { name: 'Sort by' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Descending' })).toBeVisible()
})

test('choosing a field calls onChange with the new field', async () => {
  const user = userEvent.setup()
  const sort: Sort = { field: 'createdAt', direction: 'desc' }
  const onChange = vi.fn()
  render(<ApplicationSort sort={sort} onChange={onChange} />)

  await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'deadline')

  expect(onChange).toHaveBeenCalledWith({ field: 'deadline', direction: 'desc' })
})

test('clicking the direction button flips it and updates its own label', async () => {
  const user = userEvent.setup()
  const sort: Sort = { field: 'createdAt', direction: 'desc' }
  const onChange = vi.fn()
  render(<ApplicationSort sort={sort} onChange={onChange} />)

  await user.click(screen.getByRole('button', { name: 'Descending' }))

  expect(onChange).toHaveBeenCalledWith({ field: 'createdAt', direction: 'asc' })
})
