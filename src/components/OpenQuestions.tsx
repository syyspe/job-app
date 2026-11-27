import { useId } from 'react'
import type { OpenQuestion } from '../types.ts'

interface OpenQuestionsProps {
  questions: OpenQuestion[]
}

export function OpenQuestions({ questions }: OpenQuestionsProps) {
  const headingId = useId()
  if (questions.length === 0) return null

  return (
    <section className="open-questions" aria-labelledby={headingId}>
      <div className="open-questions-header">
        <h3 id={headingId}>Open questions</h3>
        <span className="open-questions-count">{questions.length} to answer</span>
      </div>
      <ul className="open-questions-list">
        {questions.map(({ id, text }) => (
          <li key={id}>
            <span className="question-id">{id}</span> {text && <span className="question-text">{text}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}
