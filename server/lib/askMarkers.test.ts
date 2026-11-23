// @vitest-environment node
import { expect, test } from 'vitest'
import {
  editedName,
  fillAnswers,
  isMarkdown,
  markAnswered,
  openQuestionIds,
  questionTexts,
} from './askMarkers.ts'

test('openQuestionIds lists each marker id once, ignoring malformed ones', () => {
  const text = 'A [[ASK:q1]] b [[ASK:why]] c [[ASK:q1]] d [[ASK:q123]] [[ASK:q2]]'

  expect(openQuestionIds(text)).toEqual(['q1', 'q2'])
})

test('openQuestionIds sorts numerically, q2 before q10', () => {
  expect(openQuestionIds('[[ASK:q10]] [[ASK:q2]] [[ASK:q1]]')).toEqual(['q1', 'q2', 'q10'])
})

test('fillAnswers replaces every occurrence of an answered marker and leaves the rest', () => {
  const text = 'Why: [[ASK:q1]]. Again [[ASK:q1]]. When: [[ASK:q2]].'

  expect(fillAnswers(text, { q1: 'Because $& works' })).toBe(
    'Why: Because $& works. Again Because $& works. When: [[ASK:q2]].',
  )
})

test('questionTexts reads the English notes', () => {
  const notes = 'Fits well.\n\nOpen questions:\nq1: Why?\nq2:   When?\n\ntestsource: https://jobs.example/1'

  expect(questionTexts(notes)).toEqual(new Map([['q1', 'Why?'], ['q2', 'When?']]))
})

test('questionTexts reads the Finnish notes and keeps the first line per id', () => {
  const notes = 'Sopii.\n\nAvoimet kysymykset:\nq1: Miksi?\nq1: Toinen\n'

  expect(questionTexts(notes)).toEqual(new Map([['q1', 'Miksi?']]))
})

test('markAnswered inserts the answer after the question line', () => {
  const notes = 'Open questions:\nq1: Why?\nq2: When?\n\nsource: x'

  expect(markAnswered(notes, { q1: 'Because' })).toBe(
    'Open questions:\nq1: Why?\n→ Because\nq2: When?\n\nsource: x',
  )
})

test('markAnswered appends the answer when the question line is gone', () => {
  expect(markAnswered('Edited notes\n', { q2: 'Soon' })).toBe('Edited notes\nq2 → Soon')
  expect(markAnswered('', { q2: 'Soon' })).toBe('q2 → Soon')
})

test('isMarkdown accepts .md in any case', () => {
  expect(isMarkdown('Letter.md')).toBe(true)
  expect(isMarkdown('CV.MD')).toBe(true)
  expect(isMarkdown('report.pdf')).toBe(false)
  expect(isMarkdown('notes')).toBe(false)
})

test('editedName swaps the final .md for " (edited).md"', () => {
  expect(editedName('Hakemus_Acme_FI.md')).toBe('Hakemus_Acme_FI (edited).md')
  expect(editedName('CV.MD')).toBe('CV (edited).md')
})
