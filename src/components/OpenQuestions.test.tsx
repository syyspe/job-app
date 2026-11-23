import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { OpenQuestions } from './OpenQuestions'

const questions = [
  { id: 'q1', text: 'Why Acme?' },
  { id: 'q2', text: null },
]

test('renders nothing when no question is open', () => {
  const { container } = render(<OpenQuestions questions={[]} onAnswer={vi.fn()} />)

  expect(container).toBeEmptyDOMElement()
})

test('labels each answer with its id and question, or the id alone', () => {
  render(<OpenQuestions questions={questions} onAnswer={vi.fn()} />)

  expect(screen.getByRole('region', { name: 'Open questions' })).toBeVisible()
  expect(screen.getByText('2 to answer')).toBeVisible()
  expect(screen.getByRole('textbox', { name: 'q1 Why Acme?' })).toBeVisible()
  expect(screen.getByRole('textbox', { name: 'q2' })).toBeVisible()
})

test('Save answers sends only the non-blank answers', async () => {
  const user = userEvent.setup()
  const onAnswer = vi.fn()
  render(<OpenQuestions questions={questions} onAnswer={onAnswer} />)

  await user.type(screen.getByRole('textbox', { name: 'q1 Why Acme?' }), 'Great product')
  await user.type(screen.getByRole('textbox', { name: 'q2' }), '   ')
  await user.click(screen.getByRole('button', { name: 'Save answers' }))

  expect(onAnswer).toHaveBeenCalledWith({ q1: 'Great product' })
})

test('Save answers does not submit a surrounding form', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn((event: SubmitEvent) => event.preventDefault())
  render(
    <form onSubmit={(event) => onSubmit(event.nativeEvent as SubmitEvent)}>
      <OpenQuestions questions={questions} onAnswer={vi.fn()} />
    </form>,
  )

  await user.click(screen.getByRole('button', { name: 'Save answers' }))

  expect(onSubmit).not.toHaveBeenCalled()
})

test('an answer to a question that has since closed is not sent again', async () => {
  const user = userEvent.setup()
  const onAnswer = vi.fn()
  const { rerender } = render(<OpenQuestions questions={questions} onAnswer={onAnswer} />)
  await user.type(screen.getByRole('textbox', { name: 'q1 Why Acme?' }), 'Great product')

  rerender(<OpenQuestions questions={[questions[1]]} onAnswer={onAnswer} />)
  await user.type(screen.getByRole('textbox', { name: 'q2' }), 'In May')
  await user.click(screen.getByRole('button', { name: 'Save answers' }))

  expect(onAnswer).toHaveBeenCalledWith({ q2: 'In May' })
})
