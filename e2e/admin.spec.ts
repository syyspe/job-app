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

test('a basic user sees the run panel once an admin grants agent access', async ({
  page,
  browser,
}) => {
  const username = `agent-${Date.now()}`
  await logIn(page)
  await page.getByRole('button', { name: 'Admin' }).click()
  await page.getByRole('textbox', { name: 'Username' }).fill(username)
  await page.getByLabel('Password').fill('basic-password')
  await page.getByRole('button', { name: 'Add user' }).click()
  const access = page.getByRole('checkbox', { name: `Agent access for ${username}` })
  await expect(access).not.toBeChecked()

  const basicContext = await browser.newContext()
  const basicPage = await basicContext.newPage()
  await logInAs(basicPage, username, 'basic-password')
  await basicPage.getByRole('button', { name: 'Ad inbox' }).click()
  await expect(basicPage.getByRole('heading', { name: 'Ad inbox' })).toBeVisible()
  await expect(basicPage.getByRole('region', { name: 'Runs' })).toHaveCount(0)

  await access.click()
  await expect(page.getByText('Agent access granted')).toBeVisible()
  await expect(access).toBeChecked()

  await basicPage.reload()
  await basicPage.getByRole('button', { name: 'Ad inbox' }).click()
  await expect(basicPage.getByRole('region', { name: 'Runs' })).toBeVisible()
  await basicContext.close()
})
