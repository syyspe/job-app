import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { logIn } from './login.ts'

async function ingestAd(page: Page, sourceMode: string): Promise<{ id: number; title: string }> {
  const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const title = `Test Lead ${key}`
  const response = await page.request.post('/api/ads', {
    data: {
      source: 'e2e',
      sourceMode,
      externalId: key,
      url: `https://jobs.example.com/ad/${key}`,
      title,
      company: `Company ${key}`,
    },
  })
  expect(response.status()).toBe(201)
  const { id } = (await response.json()) as { id: number }
  return { id, title }
}

async function moveAd(page: Page, id: number, data: Record<string, unknown>): Promise<void> {
  const response = await page.request.post(`/api/ads/${id}/transition`, { data })
  expect(response.status()).toBe(200)
}

async function openInbox(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Ad inbox' }).click()
  await expect(page.getByRole('heading', { name: 'Ad inbox' })).toBeVisible()
}

async function showGroup(page: Page, label: string): Promise<void> {
  await page
    .getByRole('group', { name: 'Filter ads by state' })
    .getByRole('button', { name: new RegExp(`^${label} \\d+$`) })
    .click()
}

function adRow(page: Page, title: string): Locator {
  return page.getByRole('listitem').filter({ hasText: title })
}

// Ingested, fetched and evaluated as a kept ad, the way a daily run leaves it.
async function keptAd(page: Page): Promise<{ id: number; title: string }> {
  const ad = await ingestAd(page, 'automatic')
  await moveAd(page, ad.id, { to: 'ready', body: 'The full text of the ad.' })
  const evaluation = { verdict: 'suitable', fitSummary: 'Strong match.', reasons: [] }
  await moveAd(page, ad.id, { to: 'suitable', evaluation })
  return ad
}

test('dismissing an ad takes a confirmation and hides it from the inbox', async ({ page }) => {
  await logIn(page)
  const { id, title } = await keptAd(page)

  await openInbox(page)
  const row = adRow(page, title)
  await expect(row.getByText('Strong match.')).toBeVisible()
  await row.getByRole('button', { name: 'Dismiss' }).click()
  await row.getByRole('button', { name: 'Confirm dismiss' }).click()

  await expect(row).toHaveCount(0)
  await expect(
    page
      .getByRole('group', { name: 'Filter ads by state' })
      .getByRole('button', { name: /^Dismissed \d+$/ }),
  ).toHaveCount(0)
  const response = await page.request.get('/api/ads')
  const ads = (await response.json()) as { id: number; state: string }[]
  expect(ads.find((ad) => ad.id === id)?.state).toBe('dismissed')
})

test('retrying a failed ad sends it back to new', async ({ page }) => {
  await logIn(page)
  const { id, title } = await ingestAd(page, 'automatic')
  await moveAd(page, id, { to: 'failed', error: 'fetch_failed' })

  await openInbox(page)
  await showGroup(page, 'Failed')
  const row = adRow(page, title)
  await expect(row.getByText('Failed with fetch_failed')).toBeVisible()
  await row.getByRole('button', { name: 'Retry' }).click()

  await expect(row).toHaveCount(0)
  const response = await page.request.get('/api/ads')
  const ads = (await response.json()) as { id: number; state: string }[]
  expect(ads.find((ad) => ad.id === id)?.state).toBe('new')
})

test('an ad the title rules dropped shows under Set aside, saying so, with no buttons', async ({ page }) => {
  await logIn(page)
  const { id, title } = await ingestAd(page, 'automatic')
  await moveAd(page, id, { to: 'title_rejected' })

  await openInbox(page)
  await showGroup(page, 'Set aside')
  const row = adRow(page, title)
  await expect(row.getByText('Set aside by the title rules.')).toBeVisible()
  await expect(row.getByRole('link', { name: 'Open ad' })).toBeVisible()
  await expect(row.getByRole('button')).toHaveCount(0)
})
