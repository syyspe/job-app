import { expect, test } from '@playwright/test'

test('add, edit, attach a file, and delete an application', async ({
  page,
}) => {
  await page.goto('/')

  await page.getByRole('textbox', { name: 'Company' }).fill('Acme')
  await page.getByRole('textbox', { name: 'Role' }).fill('Engineer')
  await page.getByLabel('Date applied').fill('2026-01-15')
  await page.getByRole('button', { name: 'Add application' }).click()

  await expect(page.getByRole('textbox', { name: 'Company' })).toHaveValue('')

  const row = page.getByRole('button', { name: /Acme/ })
  await expect(row).toBeVisible()
  await row.click()

  const detail = page.getByRole('listitem').filter({ has: row })

  await detail
    .getByRole('combobox', { name: 'Status' })
    .selectOption('interview')
  await detail.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('button', { name: /interview/ })).toBeVisible()

  await detail.getByLabel('Attach a file').setInputFiles({
    name: 'resume.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello resume'),
  })
  await expect(detail.getByRole('link', { name: 'resume.txt' })).toBeVisible()

  await detail.getByRole('button', { name: 'Remove file' }).click()
  await expect(
    detail.getByRole('link', { name: 'resume.txt' }),
  ).not.toBeVisible()

  await detail.getByLabel('Attach a file').setInputFiles({
    name: 'cover-letter.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello letter'),
  })
  await expect(
    detail.getByRole('link', { name: 'cover-letter.txt' }),
  ).toBeVisible()

  await detail.getByRole('button', { name: 'Delete application' }).click()
  await expect(row).not.toBeVisible()
})
