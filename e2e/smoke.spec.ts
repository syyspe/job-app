import { expect, test } from '@playwright/test'
import { logIn } from './login.ts'

test('app loads', async ({ page }) => {
  await logIn(page)
  await expect(
    page.getByRole('heading', { name: 'Job applications' }),
  ).toBeVisible()
})
