import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { ApplicationSort } from './ApplicationSort'
import type { Sort } from '../lib/sorting'

test('the select and the direction radios have accessible names', () => {
  const sort: Sort = { field: 'createdAt', direction: 'desc' }
  render(<ApplicationSort sort={sort} onChange={vi.fn()} />)

  expect(screen.getByRole('combobox', { name: 'Sort by' })).toBeVisible()
  expect(screen.getByRole('group', { name: 'Direction' })).toBeVisible()
  expect(screen.getByRole('radio', { name: 'Descending' })).toBeChecked()
  expect(screen.getByRole('radio', { name: 'Ascending' })).not.toBeChecked()
})

test('choosing a field calls onChange with the new field', async () => {
  const user = userEvent.setup()
  const sort: Sort = { field: 'createdAt', direction: 'desc' }
  const onChange = vi.fn()
  render(<ApplicationSort sort={sort} onChange={onChange} />)

  await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'deadline')

  expect(onChange).toHaveBeenCalledWith({ field: 'deadline', direction: 'desc' })
})

test('choosing the other direction calls onChange with it', async () => {
  const user = userEvent.setup()
  const sort: Sort = { field: 'createdAt', direction: 'desc' }
  const onChange = vi.fn()
  render(<ApplicationSort sort={sort} onChange={onChange} />)

  await user.click(screen.getByRole('radio', { name: 'Ascending' }))

  expect(onChange).toHaveBeenCalledWith({ field: 'createdAt', direction: 'asc' })
})

test('choosing the direction already in effect does not call onChange', async () => {
  const user = userEvent.setup()
  const sort: Sort = { field: 'createdAt', direction: 'desc' }
  const onChange = vi.fn()
  render(<ApplicationSort sort={sort} onChange={onChange} />)

  await user.click(screen.getByRole('radio', { name: 'Descending' }))

  expect(onChange).not.toHaveBeenCalled()
})
