import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { logIn } from './login.ts'

const PHONE = { width: 360, height: 800 }

async function openInbox(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Ad inbox' }).click()
  await expect(page.getByRole('heading', { name: 'Ad inbox' })).toBeVisible()
}

async function expectNoSideways(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }))
  expect(widths.scroll).toBeLessThanOrEqual(widths.client)
}

async function ingestFailedAd(page: Page): Promise<string> {
  const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const title = `Phone Width Lead ${key}`
  const created = await page.request.post('/api/ads', {
    data: { source: 'e2e', sourceMode: 'automatic', externalId: key, url: `https://jobs.example.com/ad/${key}`, title, company: `Company ${key}` },
  })
  expect(created.status()).toBe(201)
  const { id } = (await created.json()) as { id: number }
  const moved = await page.request.post(`/api/ads/${id}/transition`, { data: { to: 'failed', error: 'fetch_failed' } })
  expect(moved.status()).toBe(200)
  return title
}

// A draft application whose cover letter asks one question, as agent:draft leaves it.
async function createDraftWithQuestion(page: Page): Promise<string> {
  const company = `Draft Co ${Date.now()}`
  const created = await page.request.post('/api/applications', {
    data: { company, role: 'Platform Engineer', dateApplied: '2026-11-26', status: 'draft', notes: 'q1: Which start date should the letter name?' },
  })
  expect(created.status()).toBe(201)
  const { id } = (await created.json()) as { id: number }
  const uploaded = await page.request.post(`/api/applications/${id}/attachments`, {
    multipart: {
      file: { name: 'cover-letter.md', mimeType: 'text/markdown', buffer: Buffer.from('# Cover letter\n\nI can start on [[ASK:q1]], ready to work on a long-named-component-without-breaks.\n') },
    },
  })
  expect(uploaded.status()).toBe(201)
  return company
}

test('Check mail starts a run, shows it running, then lists it as succeeded with its output', async ({ page }) => {
  await logIn(page)
  await openInbox(page)
  const panel = page.getByRole('region', { name: 'Runs' })

  await panel.getByRole('button', { name: 'Check mail' }).click()

  await expect(panel.getByText(/^Running: Mail check/)).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Run now' })).toBeDisabled()
  const newest = panel.getByRole('list', { name: 'Recent runs' }).getByRole('listitem').first()
  await expect(newest).toContainText('Succeeded', { timeout: 10_000 })
  await expect(newest).toContainText('Mail check')
  await expect(newest.getByText('stub collect: 0 new ads')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Check mail' })).toBeEnabled()
})

test('the inbox with its run panel and a failed ad with its buttons fits a 360 px phone', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await logIn(page)
  const title = await ingestFailedAd(page)
  await openInbox(page)
  await expect(page.getByRole('region', { name: 'Runs' })).toBeVisible()
  await expectNoSideways(page)

  await page.getByRole('group', { name: 'Filter ads by state' }).getByRole('button', { name: /^Failed \d+$/ }).click()
  const row = page.getByRole('listitem').filter({ hasText: title })
  await expect(row.getByRole('button', { name: 'Retry' })).toBeVisible()
  await expect(row.getByRole('button', { name: 'Dismiss' })).toBeVisible()
  await expectNoSideways(page)
})

test('a draft with open questions and its Markdown editor open fits a 360 px phone', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await logIn(page)
  const company = await createDraftWithQuestion(page)
  await page.reload()

  const row = page.getByRole('button', { name: new RegExp(company) })
  await row.click()
  const detail = page.getByRole('listitem').filter({ has: row })
  await expect(detail.getByRole('region', { name: 'Open questions' })).toBeVisible()
  await expectNoSideways(page)

  await detail.getByRole('button', { name: 'Edit cover-letter.md' }).click()
  await expect(detail.getByRole('button', { name: 'Save cover-letter.md' })).toBeVisible()
  await expectNoSideways(page)
})
