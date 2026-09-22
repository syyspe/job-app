import { expect, test } from '@playwright/test'
import { logIn } from './login.ts'

test('archive an application, reveal it, and unarchive it', async ({ page }) => {
  await logIn(page)

  await page.getByRole('textbox', { name: 'Company' }).fill('Archivco')
  await page.getByRole('textbox', { name: 'Role' }).fill('Engineer')
  await page.getByLabel('Date applied', { exact: true }).fill('2026-01-15')
  await page.getByRole('button', { name: 'Add application' }).click()

  const row = page.getByRole('button', { name: /Archivco/ })
  await expect(row).toBeVisible()
  const item = page.getByRole('listitem').filter({ has: row })

  await row.click()
  await item.getByRole('button', { name: 'Archive' }).click()
  await expect(row).not.toBeVisible()

  // The specs share one database, so match the count loosely.
  await page.getByRole('button', { name: /^Show \d+ archived$/ }).click()
  await expect(row).toBeVisible()

  await item.getByRole('button', { name: 'Unarchive' }).click()
  await expect(item.getByRole('button', { name: 'Archive' })).toBeVisible()

  // Nothing is archived any more, so the toggle stops existing.
  await expect(page.getByRole('button', { name: /archived$/ })).toHaveCount(0)
  await expect(row).toBeVisible()
})
