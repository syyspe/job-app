import { useId, useState } from 'react'
import type { OpenQuestion } from '../types.ts'

interface OpenQuestionsProps {
  questions: OpenQuestion[]
  onAnswer: (answers: Record<string, string>) => void
}

// Only questions still listed: an answer typed for one since closed would be refused.
function nonBlankAnswers(questions: OpenQuestion[], answers: Record<string, string>): Record<string, string> {
  const entries = questions.map(({ id }) => [id, answers[id] ?? ''])
  return Object.fromEntries(entries.filter(([, answer]) => answer.trim() !== ''))
}

export function OpenQuestions({ questions, onAnswer }: OpenQuestionsProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const headingId = useId()
  if (questions.length === 0) return null

  return (
    <section className="open-questions" aria-labelledby={headingId}>
      <div className="open-questions-header">
        <h3 id={headingId}>Open questions</h3>
        <span className="open-questions-count">{questions.length} to answer</span>
      </div>
      {questions.map(({ id, text }) => (
        <label key={id}>
          <span>
            <span className="question-id">{id}</span> {text && <span className="question-text">{text}</span>}
          </span>
          <textarea
            value={answers[id] ?? ''}
            onChange={(event) => setAnswers({ ...answers, [id]: event.target.value })}
          />
        </label>
      ))}
      <div className="attachment-actions">
        <button type="button" className="button button-primary" onClick={() => onAnswer(nonBlankAnswers(questions, answers))}>
          Save answers
        </button>
        <span className="open-questions-hint">Blank answers stay open.</span>
      </div>
    </section>
  )
}
