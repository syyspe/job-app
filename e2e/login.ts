import type { Page } from '@playwright/test'
import { TEST_PASSWORD, TEST_USERNAME } from './credentials.ts'

export async function logInAs(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Username' }).fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByRole('button', { name: 'Log out' }).waitFor()
}

export async function logIn(page: Page): Promise<void> {
  await logInAs(page, TEST_USERNAME, TEST_PASSWORD)
}
