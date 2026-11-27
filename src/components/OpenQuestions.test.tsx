import { render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { OpenQuestions } from './OpenQuestions'

const questions = [
  { id: 'q1', text: 'Why Acme?' },
  { id: 'q2', text: null },
]

test('renders nothing when no question is open', () => {
  const { container } = render(<OpenQuestions questions={[]} />)

  expect(container).toBeEmptyDOMElement()
})

test('lists each question by its id and text, or the id alone, with nothing to type into', () => {
  render(<OpenQuestions questions={questions} />)

  const region = screen.getByRole('region', { name: 'Open questions' })
  expect(within(region).getByText('2 to answer')).toBeVisible()
  const items = within(region).getAllByRole('listitem')
  expect(items).toHaveLength(2)
  expect(items[0]).toHaveTextContent(/^q1 Why Acme\?$/)
  expect(items[1]).toHaveTextContent(/^q2$/)
  expect(within(region).queryByRole('textbox')).not.toBeInTheDocument()
  expect(within(region).queryByRole('button', { name: 'Save answers' })).not.toBeInTheDocument()
})
