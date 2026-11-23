import { expect, test } from 'vitest'
import { alert, fakePoliteHttp, fixture } from '../../../test/fakeSources.ts'
import { duunitori } from './duunitori.ts'

const message = alert({
  from: 'duunivahti@duunitori.fi',
  subject: 'Duunitori löysi sinulle 4 työpaikkaa - Katso juuri sinulle sopivat osumat',
  date: '2026-11-19T16:19:06.000Z',
  html: fixture('duunitori-alert.html'),
})

test('matches its alerts only', () => {
  expect(duunitori.matches(message)).toBe(true)
  expect(duunitori.matches({ ...message, from: 'uutiskirje@duunitori.fi' })).toBe(false)
  expect(duunitori.matches({ ...message, subject: 'Työelämän uutiset' })).toBe(false)
})

test('is a hand-over source that fetches only its own host', () => {
  expect(duunitori.mode).toBe('handover')
  expect(duunitori.fetchHosts).toEqual(['duunitori.fi'])
})

test('parses the matched ads, dropping tracker links and the recommendations', () => {
  expect(duunitori.parseAlert(message)).toEqual([
    {
      externalId: '10000001',
      url: 'https://duunitori.fi/tyopaikat/tyo/esimerkki-oy-testaaja-abcde-10000001',
      title: 'Testaaja',
      company: 'Esimerkki Oy',
      location: 'Tampere',
      deadline: '2026-12-02',
    },
    {
      externalId: '10000002',
      url: 'https://duunitori.fi/tyopaikat/tyo/toinen-oy-kehittaja-fghij-10000002',
      title: 'Kehittäjä & arkkitehti',
      company: 'Toinen Oy',
    },
    {
      externalId: '10000003',
      url: 'https://duunitori.fi/tyopaikat/tyo/vuodenvaihde-oy-analyytikko-klmno-10000003',
      title: 'Analyytikko',
      company: 'Vuodenvaihde Oy',
      location: 'Espoo',
      deadline: '2027-01-10',
    },
  ])
})

test('an unrecognised structure parses to no candidates', () => {
  expect(duunitori.parseAlert({ ...message, html: '<p>Ei uusia</p>' })).toEqual([])
})

const candidate = {
  externalId: '10000001',
  url: 'https://duunitori.fi/tyopaikat/tyo/esimerkki-oy-testaaja-abcde-10000001',
  title: 'Testaaja',
}

test('fetchAd reads the JSON-LD description, deadline and company of the ad URL alone', async () => {
  const http = fakePoliteHttp({ kind: 'page', html: fixture('duunitori-page.html') })

  expect(await duunitori.fetchAd!(candidate, http)).toEqual({
    kind: 'ok',
    text: 'Etsimme testaajaa Tampereelle.\n\nHaku päättyy 2.12.',
    company: 'esimerkki-oy',
    deadline: '2026-12-02',
  })
  expect(http.urls).toEqual([candidate.url])
})

test('fetchAd passes gone through, and a page without JSON-LD is no_ad_text', async () => {
  expect(await duunitori.fetchAd!(candidate, fakePoliteHttp({ kind: 'gone' }))).toEqual({ kind: 'gone' })
  const page = fakePoliteHttp({ kind: 'page', html: '<main><h1>Testaaja</h1></main>' })
  expect(await duunitori.fetchAd!(candidate, page)).toEqual({ kind: 'failed', category: 'no_ad_text' })
})
