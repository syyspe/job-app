import { expect, test } from 'vitest'
import { alert, fakePoliteHttp, fixture } from '../../../test/fakeSources.ts'
import { nordea } from './nordea.ts'

const message = alert({
  from: 'nordeabank-jobnotification@noreply12.jobs2web.com',
  subject: 'New jobs posted from careers.nordea.com',
  html: fixture('nordea-alert.html'),
})

test('matches its alerts only', () => {
  expect(nordea.matches(message)).toBe(true)
  expect(nordea.matches({ ...message, from: 'otherbank-jobnotification@noreply12.jobs2web.com' })).toBe(false)
  expect(nordea.matches({ ...message, subject: 'Your application' })).toBe(false)
})

test('parses each job link, dropping foreign-host and plain-http links', () => {
  expect(nordea.parseAlert(message)).toEqual([
    {
      externalId: '1000000001',
      url: 'https://careers.nordea.com/job/Helsinki-Example-Test-Engineer-00500/1000000001/',
      title: 'Example Test Engineer',
      company: 'Nordea',
      location: 'Helsinki',
    },
    {
      externalId: '1000000002',
      url: 'https://careers.nordea.com/job/Stockholm-Data-Engineer%2C-Example-team-111-46/1000000002/',
      title: 'Data Engineer, Example team',
      company: 'Nordea',
      location: 'Stockholm',
    },
  ])
})

test('an unrecognised structure parses to no candidates', () => {
  expect(nordea.parseAlert({ ...message, html: '<p>No jobs this week</p>' })).toEqual([])
})

const candidate = { externalId: '1000000001', url: 'https://careers.nordea.com/job/x/1000000001/', title: 'T' }

test('fetchAd reads the description and its deadline', async () => {
  const http = fakePoliteHttp({ kind: 'page', html: fixture('nordea-page.html') })

  expect(await nordea.fetchAd!(candidate, http)).toEqual({
    kind: 'ok',
    text: 'Job ID: 1234\n\nYou will test example systems.\n\nNext steps\n\nWe kindly ask you to submit your application as soon as possible, but no later than 5/1/2027.',
    deadline: '2027-01-05',
  })
  expect(http.urls).toEqual([candidate.url])
})

test('fetchAd passes gone through, and a page with no description is no_ad_text', async () => {
  expect(await nordea.fetchAd!(candidate, fakePoliteHttp({ kind: 'gone' }))).toEqual({ kind: 'gone' })
  expect(await nordea.fetchAd!(candidate, fakePoliteHttp({ kind: 'page', html: '<p>Search jobs</p>' }))).toEqual({
    kind: 'failed',
    category: 'no_ad_text',
  })
})
