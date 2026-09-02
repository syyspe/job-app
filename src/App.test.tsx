import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App'

test('renders the get-started heading', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Get started' })).toBeVisible()
})
