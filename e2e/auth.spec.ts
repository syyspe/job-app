import { expect, test } from '@playwright/test'
import { logIn } from './login.ts'

test('the login form appears when logged out', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('button', { name: 'Log in' }),
  ).toBeVisible()
})

test('a reload keeps the session', async ({ page }) => {
  await logIn(page)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()
})

test('logging out brings the form back', async ({ page }) => {
  await logIn(page)
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible()
})
