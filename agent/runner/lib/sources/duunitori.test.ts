import { expect, test } from 'vitest'
import { alert, fixture } from '../../../test/fakeSources.ts'
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

test('is a hand-over source that never fetches', () => {
  expect(duunitori.mode).toBe('handover')
  expect(duunitori.fetchAd).toBeUndefined()
  expect(duunitori.fetchHosts).toBeUndefined()
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
