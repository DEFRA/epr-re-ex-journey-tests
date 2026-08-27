import { test, expect } from '@playwright/test'

/**
 * @param {import('@playwright/test').Page} page
 */
const banner = (page) => page.getByRole('region', { name: /cookies on/i })

// What server.inject cannot reach: that the button submits without javascript,
// that a real browser accepts the cookie with the attributes the service sets,
// and that it sends it back on the next navigation. The banner's own markup and
// the route's behaviour are covered in epr-frontend.
test.describe('Cookie consent @cookieConsent', () => {
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
