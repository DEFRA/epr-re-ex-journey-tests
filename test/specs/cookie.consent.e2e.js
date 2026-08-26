import { test, expect } from '@playwright/test'

// Every other spec runs with consent already answered, seeded in
// playwright.config.js, so this is the only place the banner is seen. Clearing
// storage state is what puts a browser back into the state a first-time visitor
// arrives in.
test.use({ storageState: { cookies: [], origins: [] } })

/**
 * @param {import('@playwright/test').Page} page
 */
const banner = (page) => page.getByRole('region', { name: /cookies on/i })

test.describe('Cookie consent @cookieConsent', () => {
  test('Should ask a first-time visitor', async ({ page }) => {
    await page.goto('/start')

    await expect(banner(page)).toBeVisible()
    await expect(
      banner(page).getByRole('button', { name: 'Accept analytics cookies' })
    ).toBeVisible()
    await expect(
      banner(page).getByRole('button', { name: 'Reject analytics cookies' })
    ).toBeVisible()
  })

  // Playwright has no it.each equivalent, so the cases are generated.
  const choices = ['Accept analytics cookies', 'Reject analytics cookies']

  choices.forEach((choice) => {
    test(`Should stop asking once the visitor chooses ${choice}`, async ({
      page
    }) => {
      await page.goto('/start')
      await page.getByRole('button', { name: choice }).click()

      await expect(banner(page)).toBeHidden()

      await page.goto('/start')

      await expect(banner(page)).toBeHidden()
    })
  })
})
