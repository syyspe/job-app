import { expect, test } from '@playwright/test'
import { logIn } from './login.ts'

const companies = ['Pager One', 'Pager Two', 'Pager Three', 'Pager Four']

test('the list shows one page at a time and the pager moves between them', async ({
  page,
}) => {
  await logIn(page)

  for (const company of companies) {
    await page.getByRole('textbox', { name: 'Company' }).fill(company)
    await page.getByRole('textbox', { name: 'Role' }).fill('Engineer')
    await page.getByRole('button', { name: 'Add application' }).click()
    // The specs run in parallel against one database, so another worker's row
    // can land on top of this one — wait for the form to clear, not the row.
    await expect(page.getByRole('textbox', { name: 'Company' })).toHaveValue('')
  }

  // PAGE_SIZE is 3 in the Playwright config; the four rows above guarantee a
  // second page. Stay loose about the total, like archive.spec.ts does.
  await expect(page.getByRole('listitem')).toHaveCount(3)

  const position = page.getByText(/^Page \d+ of \d+$/)
  const previous = page.getByRole('button', { name: 'Previous' })
  const next = page.getByRole('button', { name: 'Next' })

  await expect(position).toHaveText(/^Page 1 of \d+$/)
  await expect(previous).toBeDisabled()

  await next.click()
  await expect(position).toHaveText(/^Page 2 of \d+$/)
  await expect(previous).toBeEnabled()

  await previous.click()
  await expect(position).toHaveText(/^Page 1 of \d+$/)
})
