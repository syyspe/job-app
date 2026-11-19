// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { existsSync, readdirSync } from 'node:fs'
import {
  baseUrl,
  cookie,
  db,
  evaluation,
  ingest,
  moved,
  otherCookie,
  post,
  readAd,
  readyAd,
  uploadsDir,
  withAdsApi,
} from '../test/adsApi.ts'
import type { Ad, Application } from '../types.ts'

withAdsApi()

const FIELDS = {
  company: 'Example Oy',
  role: 'Test Lead',
  deadline: '2026-12-01',
  link: 'https://jobs.example.com/ad/1',
  notes: 'Fits well.\n\nq1: Why this company?',
}

const FILES = {
  coverLetter: 'P_Hakemus_Example_FI.txt',
  cv: 'P_CV_Example_FI.txt',
  ad: 'Example_Test_Lead_ilmoitus.txt',
}

interface DraftParts {
  fields?: Record<string, string>
  files?: Partial<typeof FILES>
}

function draftForm({ fields = FIELDS, files = FILES }: DraftParts = {}): FormData {
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) form.append(name, value)
  for (const [name, fileName] of Object.entries(files)) {
    form.append(name, new Blob([`${name} text`], { type: 'text/plain; charset=utf-8' }), fileName)
  }
  return form
}

function postDraft(id: number, parts: DraftParts = {}, sessionCookie = cookie): Promise<Response> {
  return fetch(`${baseUrl}/api/ads/${id}/draft`, {
    method: 'POST',
    headers: { Cookie: sessionCookie },
    body: draftForm(parts),
  })
}

async function suitableAd(overrides: Record<string, unknown> = {}): Promise<Ad> {
  const ad = await readyAd(overrides)
  return moved(ad.id, { to: 'suitable', evaluation: evaluation('suitable') })
}

function storedFiles(): string[] {
  return existsSync(uploadsDir) ? readdirSync(uploadsDir) : []
}

function applicationCount(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM applications').get() as { n: number }).n
}

describe('drafting an application from an ad', () => {
  test('a suitable ad becomes a draft application with three attachments', async () => {
    const ad = await suitableAd()

    const res = await postDraft(ad.id)

    expect(res.status).toBe(201)
    const result = (await res.json()) as { ad: Ad; application: Application }
    expect(result.application).toMatchObject({ status: 'draft', dateApplied: '', ...FIELDS })
    expect(result.application.attachments.map((a) => a.originalName)).toEqual([
      FILES.coverLetter,
      FILES.cv,
      FILES.ad,
    ])
    expect(result.ad).toMatchObject({
      state: 'drafted',
      applicationId: result.application.id,
      body: null,
    })
    expect(storedFiles()).toHaveLength(3)
  })

  test('a file name keeps its non-ASCII letters', async () => {
    const ad = await suitableAd()

    const res = await postDraft(ad.id, { files: { ...FILES, cv: 'P_CV_Ääkkönen_FI.txt' } })

    const { application } = (await res.json()) as { application: Application }
    expect(application.attachments[1].originalName).toBe('P_CV_Ääkkönen_FI.txt')
  })

  test('a status field in the request is ignored', async () => {
    const ad = await suitableAd()

    const res = await postDraft(ad.id, {
      fields: { ...FIELDS, status: 'applied', dateApplied: '2026-11-01' },
    })

    const { application } = (await res.json()) as { application: Application }
    expect(application.status).toBe('draft')
    expect(application.dateApplied).toBe('')
  })

  test('a second call answers 409 and writes nothing', async () => {
    const ad = await suitableAd()
    await postDraft(ad.id)

    const res = await postDraft(ad.id)

    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: string }).error).toBe(
      'an ad cannot be drafted from drafted',
    )
    expect(applicationCount()).toBe(1)
    expect(storedFiles()).toHaveLength(3)
  })

  test('an ad that is not suitable answers 409', async () => {
    const ad = await readyAd()

    expect((await postDraft(ad.id)).status).toBe(409)
    expect(applicationCount()).toBe(0)
    expect(storedFiles()).toEqual([])
  })

  test('a missing file answers 400 and leaves no file on disk', async () => {
    const ad = await suitableAd()

    const res = await postDraft(ad.id, { files: { coverLetter: FILES.coverLetter, cv: FILES.cv } })

    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe(
      'coverLetter, cv and ad files are required',
    )
    expect(storedFiles()).toEqual([])
    expect((await readAd(ad.id)).state).toBe('suitable')
  })

  test('a missing company answers 400 and leaves no file on disk', async () => {
    const ad = await suitableAd()

    const res = await postDraft(ad.id, { fields: { ...FIELDS, company: '' } })

    expect(res.status).toBe(400)
    expect(storedFiles()).toEqual([])
    expect(applicationCount()).toBe(0)
  })

  test.each([
    ['a foreign ad', async () => ({ id: (await suitableAd()).id, as: otherCookie })],
    ['an unknown ad', () => Promise.resolve({ id: 999, as: cookie })],
  ])('%s answers 404 with nothing written', async (_name, target) => {
    const { id, as } = await target()

    const res = await postDraft(id, {}, as)

    expect(res.status).toBe(404)
    expect(storedFiles()).toEqual([])
    expect(applicationCount()).toBe(0)
  })

  test('a hand-over ad keeps its title and company until reported', async () => {
    const handover = await ingest({ sourceMode: 'handover' })
    await moved(handover.id, { to: 'ready', body: 'The ad text.' })
    await moved(handover.id, { to: 'suitable', evaluation: evaluation('suitable') })

    await postDraft(handover.id)

    const drafted = await readAd(handover.id)
    expect(drafted.title).toBe(handover.title)
    expect(drafted.company).toBe(handover.company)
    await post('/ads/reported', { ids: [handover.id] })
    expect((await readAd(handover.id)).title).toBe('')
  })
})
