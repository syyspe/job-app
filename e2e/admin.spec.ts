import { expect, test } from '@playwright/test'
import { logIn, logInAs } from './login.ts'

test('an admin creates a user who is then locked out of the admin page', async ({
  page,
}) => {
  const username = `basic-${Date.now()}`
  await logIn(page)

  await page.getByRole('button', { name: 'Admin' }).click()
  await page.getByRole('textbox', { name: 'Username' }).fill(username)
  await page.getByLabel('Password').fill('basic-password')
  await page.getByRole('button', { name: 'Add user' }).click()
  await expect(
    page.getByRole('combobox', { name: `Role for ${username}` }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Log out' }).click()
  await logInAs(page, username, 'basic-password')

  await expect(page.getByRole('button', { name: 'Admin' })).toHaveCount(0)
  const response = await page.request.get('/api/users')
  expect(response.status()).toBe(403)
})
