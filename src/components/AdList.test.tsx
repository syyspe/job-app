import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { AdList } from './AdList'
import type { AdSummary } from '../types'

const actions = { onHandOver: vi.fn(), onRetry: vi.fn(), onDismiss: vi.fn() }

const ad: AdSummary = {
  id: 1,
  source: 'duunitori',
  sourceMode: 'handover',
  externalId: 'abc',
  url: 'https://example.com/ad/1',
  title: 'Test Lead',
  company: 'Acme',
  location: '',
  deadline: '',
  state: 'failed',
  evaluation: null,
  applicationId: null,
  duplicateOf: null,
  attempts: 3,
  lastError: 'gone',
  firstSeenAt: '2026-11-01 08:00:00',
  updatedAt: '2026-11-01 08:00:00',
  reportedAt: null,
}

test('renders a row per ad', () => {
  render(<AdList ads={[ad]} stateLabel="Failed" actions={actions} />)

  expect(screen.getAllByRole('listitem')).toHaveLength(1)
  expect(screen.getByText('Test Lead')).toBeVisible()
})

test('says so when the state holds no ads', () => {
  render(<AdList ads={[]} stateLabel="Failed" actions={actions} />)

  expect(screen.getByText('No ads in Failed')).toBeVisible()
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
})
