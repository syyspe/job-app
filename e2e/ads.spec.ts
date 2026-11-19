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

async function moveAd(page: Page, id: number, data: Record<string, string>): Promise<void> {
  const response = await page.request.post(`/api/ads/${id}/transition`, { data })
  expect(response.status()).toBe(200)
}

async function openInbox(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Ad inbox' }).click()
  await expect(page.getByRole('heading', { name: 'Ad inbox' })).toBeVisible()
}

async function showState(page: Page, label: string): Promise<void> {
  await page
    .getByRole('group', { name: 'Filter ads by state' })
    .getByRole('button', { name: new RegExp(`^${label} \\d+$`) })
    .click()
}

function adRow(page: Page, title: string): Locator {
  return page.getByRole('listitem').filter({ hasText: title })
}

test('an ad waiting for its text is handed over and becomes ready', async ({ page }) => {
  await logIn(page)
  const { id, title } = await ingestAd(page, 'handover')
  await moveAd(page, id, { to: 'awaiting_handover' })

  await openInbox(page)
  const row = adRow(page, title)
  await row.getByRole('button', { name: 'Hand over', exact: true }).click()
  await row.getByRole('textbox', { name: 'Ad text' }).fill('The full text of the ad.')
  await row.getByRole('button', { name: 'Hand over ad' }).click()

  await expect(row).toHaveCount(0)
  await showState(page, 'Ready')
  await expect(adRow(page, title)).toBeVisible()
})

test('dismissing an ad takes a confirmation and moves it to dismissed', async ({ page }) => {
  await logIn(page)
  const { id, title } = await ingestAd(page, 'automatic')
  await moveAd(page, id, { to: 'awaiting_handover' })

  await openInbox(page)
  const row = adRow(page, title)
  await row.getByRole('button', { name: 'Dismiss' }).click()
  await row.getByRole('button', { name: 'Confirm dismiss' }).click()

  await expect(row).toHaveCount(0)
  await showState(page, 'Dismissed')
  await expect(adRow(page, title)).toBeVisible()
})

test('retrying a failed ad sends it back to new', async ({ page }) => {
  await logIn(page)
  const { id, title } = await ingestAd(page, 'automatic')
  await moveAd(page, id, { to: 'failed', error: 'fetch_failed' })

  await openInbox(page)
  await showState(page, 'Failed')
  const row = adRow(page, title)
  await expect(row.getByText('Failed with fetch_failed')).toBeVisible()
  await row.getByRole('button', { name: 'Retry' }).click()

  await expect(row).toHaveCount(0)
  await showState(page, 'New')
  await expect(adRow(page, title)).toBeVisible()
})
