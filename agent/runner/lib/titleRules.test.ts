// @vitest-environment node
import { expect, test } from 'vitest'
import { matchesReject, screenTarget } from './titleRules.ts'

test.each([
  ['Summer Intern, Backend', ['intern'], true],
  ['International Sales Lead', ['intern'], false],
  ['SENIOR TRAINEE', ['trainee'], true],
  ['Ohjelmistokehittäjä', ['kehittä'], false],
  ['Kehittäjä (osa-aikainen)', ['osa-aikainen'], true],
  ['Backend developer, part-time', ['part time'], false],
  ['Backend developer, part time', ['part time'], true],
  ['C++ developer', ['c++'], true],
  ['Developer (C)', ['c++'], false],
  ['Node.js engineer', ['node.js'], true],
  ['Nodexjs engineer', ['node.js'], false],
])('%s against %j matches: %s', (title, phrases, expected) => {
  expect(matchesReject(title, phrases)).toBe(expected)
})

test('no phrases match nothing', () => {
  expect(matchesReject('Trainee', [])).toBe(false)
})

test.each([
  ['handover', 'Trainee', 'title_rejected'],
  ['automatic', 'Trainee', 'title_rejected'],
  ['handover', 'Backend developer', 'awaiting_handover'],
  ['automatic', 'Backend developer', null],
] as const)('a %s ad titled %s goes to %s', (sourceMode, title, target) => {
  expect(screenTarget({ sourceMode, title }, ['trainee'])).toBe(target)
})
