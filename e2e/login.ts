import type { Page } from '@playwright/test'
import { TEST_PASSWORD, TEST_USERNAME } from './credentials.ts'

export async function logIn(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Username' }).fill(TEST_USERNAME)
  await page.getByLabel('Password').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByRole('button', { name: 'Log out' }).waitFor()
}
