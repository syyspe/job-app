import { expect, test } from 'vitest'
import { alert, fakePoliteHttp, fixture } from '../../../test/fakeSources.ts'
import { valtiolle } from './valtiolle.ts'

const message = alert({ from: 'hakuvahti@valtiolle.fi', subject: 'Valtiolle.fi - Hakuvahtitulos', html: fixture('valtiolle-alert.html') })

test('matches its alerts only', () => {
  expect(valtiolle.matches(message)).toBe(true)
  expect(valtiolle.matches({ ...message, from: 'uutiset@valtiolle.fi' })).toBe(false)
  expect(valtiolle.matches({ ...message, subject: 'Uutiskirje' })).toBe(false)
})

test('decodes each ad from its tracker link, dropping foreign hosts and non-ad links', () => {
  expect(valtiolle.parseAlert(message)).toEqual([
    {
      externalId: '11111',
      url: 'https://valtiolle.fi/fi/tyopaikat/testiasiantuntija-11111/',
      title: 'Testiasiantuntija (määräaikainen)',
      company: 'Esimerkkivirasto',
      deadline: '2026-12-04',
    },
    {
      externalId: '22222',
      url: 'https://valtiolle.fi/fi/tyopaikat/kehittaja-2-kpl-22222/',
      title: 'Kehittäjä (2 kpl)',
      company: 'Toinen virasto & laitos',
    },
  ])
})

test('an unrecognised structure parses to no candidates', () => {
  expect(valtiolle.parseAlert({ ...message, html: '<p>Ei työpaikkoja</p>' })).toEqual([])
})

const candidate = { externalId: '11111', url: 'https://valtiolle.fi/fi/tyopaikat/testiasiantuntija-11111/', title: 'T' }

test('fetchAd reads the article, with company and deadline from the JSON-LD posting', async () => {
  const http = fakePoliteHttp({ kind: 'page', html: fixture('valtiolle-page.html') })

  expect(await valtiolle.fetchAd!(candidate, http)).toEqual({
    kind: 'ok',
    text: 'Testiasiantuntija\n\nEsimerkkivirasto hakee testiasiantuntijaa.\n\nHakijalta odotamme\n\ntestausosaamista\n\nTarjoamme sinulle\n\nLounasetu.',
    company: 'Esimerkkivirasto',
    deadline: '2026-12-04',
  })
  expect(http.urls).toEqual([candidate.url])
})

test('fetchAd passes gone through, and a page with no article is no_ad_text', async () => {
  expect(await valtiolle.fetchAd!(candidate, fakePoliteHttp({ kind: 'gone' }))).toEqual({ kind: 'gone' })
  expect(await valtiolle.fetchAd!(candidate, fakePoliteHttp({ kind: 'page', html: '<main>Hello</main>' }))).toEqual({
    kind: 'failed',
    category: 'no_ad_text',
  })
})
