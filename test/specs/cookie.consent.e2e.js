import { test, expect } from '@playwright/test'

/**
 * @import { Page } from '@playwright/test'
 */

/**
 * @param {Page} page
 */
const banner = (page) =>
  page.getByRole('region', {
    name: 'Cookies on Record reprocessed or exported packaging waste'
  })

/**
 * @param {Page} page
 */
const startHeading = (page) =>
  page.getByRole('heading', {
    level: 1,
    name: 'Record reprocessed or exported packaging waste'
  })

/**
 * @param {Page} page
 */
const cookiesHeading = (page) =>
  page.getByRole('heading', { level: 1, name: 'Cookies', exact: true })

/**
 * @param {Page} page
 */
const openStartPageWithBanner = async (page) => {
  await page.goto('/start')

  await expect(banner(page)).toBeVisible()
  await expect(banner(page)).toContainText(
    'We use some essential cookies to make this service work.'
  )
  await expect(banner(page)).toContainText(
    "We'd also like to use analytics cookies so we can understand how you use the service and make improvements."
  )
}

/**
 * @param {Page} page
 * @param {string} message
 */
const expectConfirmedOnce = async (page, message) => {
  await expect(banner(page).getByRole('alert')).toContainText(
    `${message} You can change your cookie settings at any time.`
  )
  await expect(startHeading(page)).toBeVisible()

  await page.goto('/start')

  await expect(banner(page)).toBeHidden()
}

// What server.inject cannot reach: that the buttons submit without
// javascript, that a real browser keeps the cookies the service sets and sends
// them back on the next navigation, and that it says which page it came from.
test.describe('Cookie consent @cookieConsent', () => {
  test('Should confirm once that the visitor accepted analytics cookies', async ({
    page
  }) => {
    await openStartPageWithBanner(page)

    await banner(page)
      .getByRole('button', { name: 'Accept analytics cookies' })
      .click()

    await expectConfirmedOnce(page, "You've accepted analytics cookies.")
  })

  test('Should confirm once that the visitor rejected analytics cookies', async ({
    page
  }) => {
    await openStartPageWithBanner(page)

    await banner(page)
      .getByRole('button', { name: 'Reject analytics cookies' })
      .click()

    await expectConfirmedOnce(page, "You've rejected analytics cookies.")
  })

  test('Should hide the confirmation when asked', async ({ page }) => {
    await openStartPageWithBanner(page)
    await banner(page)
      .getByRole('button', { name: 'Accept analytics cookies' })
      .click()

    await banner(page)
      .getByRole('button', { name: 'Hide cookie message' })
      .click()

    await expect(banner(page)).toBeHidden()
    await expect(startHeading(page)).toBeVisible()
  })

  test('Should let the visitor change their mind from the confirmation', async ({
    page
  }) => {
    await openStartPageWithBanner(page)
    await banner(page)
      .getByRole('button', { name: 'Reject analytics cookies' })
      .click()

    await banner(page)
      .getByRole('link', { name: 'change your cookie settings' })
      .click()

    await expect(cookiesHeading(page)).toBeVisible()
  })

  test('Should take the visitor to the cookies page from the banner', async ({
    page
  }) => {
    await openStartPageWithBanner(page)

    await banner(page).getByRole('link', { name: 'View cookies' }).click()

    await expect(cookiesHeading(page)).toBeVisible()
  })

  test('Should return the visitor to their page once they save their settings', async ({
    page
  }) => {
    await openStartPageWithBanner(page)
    await banner(page).getByRole('link', { name: 'View cookies' }).click()

    await page
      .getByRole('radio', {
        name: 'Use cookies that measure my service use',
        exact: true
      })
      .check()
    await page.getByRole('button', { name: 'Save cookie settings' }).click()

    await expect(page.getByRole('alert')).toContainText(
      "You've set your cookie preferences."
    )

    await page
      .getByRole('link', { name: 'Go back to the page you were looking at' })
      .click()

    await expect(startHeading(page)).toBeVisible()
  })
})
