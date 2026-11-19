// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { fakeAd } from '../../test/fakeJobAppAds.ts'
import { buildDraft, fileComponent } from './draftApplication.ts'
import type { DraftOutput } from './draftOutput.ts'
import type { Ad } from './jobApp.ts'

const naming = { filePrefix: 'Tester', savedOn: '2026-11-19' }

function ad(fields: Partial<Ad> = {}): Ad {
  return {
    ...fakeAd({ id: 1, state: 'suitable', title: 'Test Lead', company: 'Example Oy', body: 'Full ad text.' }),
    ...fields,
  }
}

function output(fields: Partial<DraftOutput> = {}): DraftOutput {
  return {
    language: 'en',
    applicationType: 'portal',
    company: '',
    role: '',
    applyTo: '',
    fitSummary: 'Fits well.',
    coverLetter: 'Letter [[ASK:q1]]',
    cv: 'CV',
    questions: [{ id: 'q1', text: 'Why this company?' }],
    ...fields,
  }
}

describe('file names', () => {
  test.each([
    ['fi', 'portal', ['Tester_Hakemus_Example_Oy_FI.txt', 'Tester_CV_Example_Oy_FI.txt', 'Example_Oy_Test_Lead_ilmoitus.txt']],
    ['en', 'portal', ['Tester_CoverLetter_Example_Oy_EN.txt', 'Tester_CV_Example_Oy_EN.txt', 'Example_Oy_Test_Lead_ad.txt']],
    ['fi', 'email', ['Tester_Hakemus_Example_Oy_FI.txt', 'Tester_CV_Example_Oy_FI.txt', 'Example_Oy_Test_Lead_ilmoitus.txt']],
    ['en', 'email', ['Tester_CoverLetter_Example_Oy_EN.txt', 'Tester_CV_Example_Oy_EN.txt', 'Example_Oy_Test_Lead_ad.txt']],
  ] as const)('%s %s', (language, applicationType, names) => {
    const { files } = buildDraft(ad(), output({ language, applicationType }), naming)

    expect([files.coverLetter.name, files.cv.name, files.ad.name]).toEqual(names)
  })

  test.each([
    ['Ääkkönen Oy', 'Ääkkönen_Oy'],
    ['Acme / Sub-unit', 'Acme_Sub-unit'],
    ['../../etc', 'etc'],
    ['..', 'Unknown'],
    ['', 'Unknown'],
    ['A very long company name that goes on and on Oy', 'A_very_long_company_name_that_goes_on_an'],
    ['Company name of exactly forty characters', 'Company_name_of_exactly_forty_characters'],
    [`${'a'.repeat(39)} X`, 'a'.repeat(39)],
  ])('fileComponent(%j) is %j', (text, component) => {
    expect(fileComponent(text)).toBe(component)
  })
})

describe('company and role', () => {
  test("the ad's values win over the model's", () => {
    const draft = buildDraft(ad(), output({ company: 'Other', role: 'Other' }), naming)

    expect([draft.company, draft.role]).toEqual(['Example Oy', 'Test Lead'])
  })

  test("the model's values fill in what the ad lacks", () => {
    const draft = buildDraft(ad({ company: '', title: ' ' }), output({ company: 'Read Oy', role: 'Read role' }), naming)

    expect([draft.company, draft.role]).toEqual(['Read Oy', 'Read role'])
  })

  test('neither gives the placeholder and its fixed question', () => {
    const draft = buildDraft(ad({ company: '' }), output(), naming)

    expect(draft.company).toBe('Unknown company')
    expect(draft.files.cv.name).toBe('Tester_CV_Unknown_company_EN.txt')
    expect(draft.notes).toContain('company: Which company is this ad for? The ad does not say.')
  })
})

describe('notes and the saved ad', () => {
  test('notes hold the fit summary, the questions and the source', () => {
    const draft = buildDraft(ad(), output({ questions: [{ id: 'q1', text: 'Why?' }, { id: 'q2', text: 'When?' }] }), naming)

    expect(draft.notes).toBe('Fits well.\n\nOpen questions:\nq1: Why?\nq2: When?\n\ntestsource: https://jobs.example/1')
  })

  test('FI notes are labelled in Finnish, and no questions means no list', () => {
    const draft = buildDraft(ad(), output({ language: 'fi', questions: [] }), naming)

    expect(draft.notes).toBe('Fits well.\n\ntestsource: https://jobs.example/1')
  })

  test('the link and deadline come from the ad', () => {
    const draft = buildDraft(ad({ deadline: '2026-12-01' }), output(), naming)

    expect([draft.link, draft.deadline]).toEqual(['https://jobs.example/1', '2026-12-01'])
  })

  test('the saved ad header falls back to the ad URL to apply to', () => {
    const { files } = buildDraft(ad(), output(), naming)

    expect(files.ad.text).toBe(
      'Source: https://jobs.example/1\nApply to: https://jobs.example/1\nSaved: 2026-11-19\n\nTest Lead\n\nFull ad text.\n',
    )
  })

  test('the saved ad header names applyTo when the ad gives one, in Finnish', () => {
    const { files } = buildDraft(ad(), output({ language: 'fi', applyTo: 'jobs@example.com' }), naming)

    expect(files.ad.text).toMatch(/^Lähde: https:\/\/jobs.example\/1\nHakuosoite: jobs@example.com\nTallennettu: 2026-11-19\n/)
  })

  test('the cover letter and CV are the model text as is', () => {
    const { files } = buildDraft(ad(), output(), naming)

    expect([files.coverLetter.text, files.cv.text]).toEqual(['Letter [[ASK:q1]]', 'CV'])
  })
})
