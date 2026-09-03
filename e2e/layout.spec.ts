import { expect, test } from '@playwright/test'

test('the form and list sit side by side on wide viewports, stacked on narrow ones', async ({
  page,
}) => {
  await page.goto('/')

  await page.getByRole('textbox', { name: 'Company' }).fill('Layout Co')
  await page.getByRole('textbox', { name: 'Role' }).fill('Engineer')
  await page.getByLabel('Date applied').fill('2026-01-15')

  const addButton = page.getByRole('button', { name: 'Add application' })
  await addButton.click()

  const row = page.getByRole('button', { name: /Layout Co/ })
  await expect(row).toBeVisible()

  await page.setViewportSize({ width: 1280, height: 800 })
  const addBoxWide = await addButton.boundingBox()
  const rowBoxWide = await row.boundingBox()
  expect(addBoxWide).not.toBeNull()
  expect(rowBoxWide).not.toBeNull()
  expect(rowBoxWide!.x).toBeGreaterThan(addBoxWide!.x)
  // Side by side, not just further right: the two must share vertical space.
  expect(rowBoxWide!.y).toBeLessThan(addBoxWide!.y + addBoxWide!.height)

  await page.setViewportSize({ width: 600, height: 800 })
  const addBoxNarrow = await addButton.boundingBox()
  const rowBoxNarrow = await row.boundingBox()
  expect(addBoxNarrow).not.toBeNull()
  expect(rowBoxNarrow).not.toBeNull()
  expect(rowBoxNarrow!.y).toBeGreaterThan(addBoxNarrow!.y + addBoxNarrow!.height)
})
