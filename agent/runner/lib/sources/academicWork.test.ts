import { expect, test } from 'vitest'
import { alert, fakePoliteHttp, fixture } from '../../../test/fakeSources.ts'
import { academicWork } from './academicWork.ts'

const message = alert({ from: 'no-reply@academicwork.fi', subject: 'Duunivahtisi uusimmat työpaikat', html: fixture('academicwork-alert.html') })

test('matches its alerts only', () => {
  expect(academicWork.matches(message)).toBe(true)
  expect(academicWork.matches({ ...message, from: 'no-reply@example.com' })).toBe(false)
  expect(academicWork.matches({ ...message, subject: 'Uutiskirje' })).toBe(false)
})

test('parses each job card, dropping foreign-host and tracker links', () => {
  expect(academicWork.parseAlert(message)).toEqual([
    {
      externalId: 'AAA111',
      url: 'https://www.academicwork.fi/avoimet-tyopaikat/j/test-engineer-acme-espoo/AAA111',
      title: 'Test Engineer, Acme, Espoo',
      location: 'Espoo',
    },
    {
      externalId: 'BBB222',
      url: 'https://www.academicwork.fi/avoimet-tyopaikat/j/data-analyst-bolt-helsinki/BBB222',
      title: 'Data Analyst, Bolt Oy, Helsinki',
      location: 'Helsinki',
    },
  ])
})

test('an unrecognised structure parses to no candidates', () => {
  expect(academicWork.parseAlert({ ...message, html: '<p>Something else</p>' })).toEqual([])
})

const candidate = { externalId: 'AAA111', url: 'https://www.academicwork.fi/avoimet-tyopaikat/j/x/AAA111', title: 'T' }

test('fetchAd reads the ad section and its company', async () => {
  const http = fakePoliteHttp({ kind: 'page', html: fixture('academicwork-page.html') })

  const result = await academicWork.fetchAd!(candidate, http)

  expect(http.urls).toEqual([candidate.url])
  expect(result).toMatchObject({ kind: 'ok', company: 'Acme Oy' })
  expect(result.kind === 'ok' && result.text).toContain('You test widgets.')
  expect(result.kind === 'ok' && result.text).not.toContain('Other job')
})

test('fetchAd passes gone through, and a page with no ad is no_ad_text', async () => {
  expect(await academicWork.fetchAd!(candidate, fakePoliteHttp({ kind: 'gone' }))).toEqual({ kind: 'gone' })
  expect(await academicWork.fetchAd!(candidate, fakePoliteHttp({ kind: 'page', html: '<main></main>' }))).toEqual({
    kind: 'failed',
    category: 'no_ad_text',
  })
})
