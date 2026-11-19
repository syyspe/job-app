// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { makeTempDir } from '../../test/tempDir.ts'
import type { TempDir } from '../../test/tempDir.ts'
import { loadDraftConfig, loadRunnerConfig } from './runnerConfig.ts'

let dir: TempDir

beforeEach(() => {
  dir = makeTempDir()
})

afterEach(() => {
  dir.remove()
})

function writeConfig(value: unknown): string {
  return dir.write('config.json', JSON.stringify(value))
}

test('missing keys take their defaults and other keys are ignored', () => {
  const path = writeConfig({ ollamaUrl: 'http://laptop.example:11434', corpus: [] })

  expect(loadRunnerConfig(path)).toEqual({
    titleRules: { reject: [] },
    evaluation: { concurrency: 2, perRunCap: 10, timeoutMs: 300000 },
  })
})

test('configured values win over the defaults', () => {
  const path = writeConfig({ titleRules: { reject: ['trainee'] }, evaluation: { concurrency: 4 } })

  expect(loadRunnerConfig(path)).toEqual({
    titleRules: { reject: ['trainee'] },
    evaluation: { concurrency: 4, perRunCap: 10, timeoutMs: 300000 },
  })
})

test.each([
  ['a concurrency above 8', { evaluation: { concurrency: 9 } }, 'evaluation.concurrency'],
  ['a fractional cap', { evaluation: { perRunCap: 1.5 } }, 'evaluation.perRunCap'],
  ['an empty reject phrase', { titleRules: { reject: [''] } }, 'titleRules.reject[0]'],
])('%s is an exit-2 error naming the field', (_name, value, field) => {
  const path = writeConfig(value)

  expect(() => loadRunnerConfig(path)).toThrow(
    expect.objectContaining({ exitCode: 2, message: expect.stringContaining(`${path}: ${field}: `) }),
  )
})

test('a missing file exits 2 naming it', () => {
  const path = `${dir.root}/missing.json`

  expect(() => loadRunnerConfig(path)).toThrow(expect.objectContaining({ exitCode: 2, message: `${path}: file not found` }))
})

test('bad JSON exits 2 naming the file', () => {
  const path = dir.write('config.json', '{ nope')

  expect(() => loadRunnerConfig(path)).toThrow(expect.objectContaining({ exitCode: 2, message: `${path}: invalid JSON` }))
})

describe('drafting', () => {
  const drafting = { filePrefix: 'Tester', cvTemplates: { fi: '/cv/fi.md', en: '/cv/en.md' } }

  test('missing keys take their defaults', () => {
    const path = writeConfig({ drafting })

    expect(loadDraftConfig(path)).toEqual({ concurrency: 1, perRunCap: 3, timeoutMs: 600000, ...drafting })
  })

  test('agent:evaluate does not need the drafting key', () => {
    expect(() => loadRunnerConfig(writeConfig({}))).not.toThrow()
  })

  test.each([
    ['a missing filePrefix', { cvTemplates: drafting.cvTemplates }, 'drafting.filePrefix'],
    ['missing cvTemplates', { filePrefix: 'Tester' }, 'drafting.cvTemplates'],
    ['a relative template path', { ...drafting, cvTemplates: { fi: 'cv/fi.md', en: '/cv/en.md' } }, 'drafting.cvTemplates.fi'],
    ['a concurrency above 4', { ...drafting, concurrency: 5 }, 'drafting.concurrency'],
  ])('%s is an exit-2 error naming the field', (_name, value, field) => {
    const path = writeConfig({ drafting: value })

    expect(() => loadDraftConfig(path)).toThrow(
      expect.objectContaining({ exitCode: 2, message: expect.stringContaining(`${path}: ${field}: `) }),
    )
  })
})
