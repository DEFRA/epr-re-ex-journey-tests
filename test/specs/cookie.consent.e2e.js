import { test, expect } from '@playwright/test'

/**
 * @import { Page } from '@playwright/test'
 */

const SERVICE_NAME = 'Record reprocessed or exported packaging waste'

const ESSENTIAL_COPY =
  'We use some essential cookies to make this service work.'

const ANALYTICS_COPY =
  "We'd also like to use analytics cookies so we can understand how you use the service and make improvements."

/**
 * @param {Page} page
 */
const banner = (page) =>
  page.getByRole('region', { name: `Cookies on ${SERVICE_NAME}` })

/**
 * @param {Page} page
 */
const openStartPageWithBanner = async (page) => {
  await page.goto('/start')

  await expect(banner(page)).toBeVisible()
  await expect(banner(page)).toContainText(ESSENTIAL_COPY)
  await expect(banner(page)).toContainText(ANALYTICS_COPY)
}

/**
 * @param {Page} page
 */
const expectBannerRemainsHidden = async (page) => {
  await expect(banner(page)).toBeHidden()

  await page.goto('/start')

  await expect(banner(page)).toBeHidden()
}

// What server.inject cannot reach: that the button submits without javascript,
// that a real browser accepts the cookie with the attributes the service sets,
// and that it sends it back on the next navigation.
test.describe('Cookie consent @cookieConsent', () => {
  test('Should stop asking once the visitor accepts analytics cookies', async ({
    page
  }) => {
    await openStartPageWithBanner(page)

    await banner(page)
      .getByRole('button', { name: 'Accept analytics cookies' })
      .click()

    await expectBannerRemainsHidden(page)
  })

  test('Should stop asking once the visitor rejects analytics cookies', async ({
    page
  }) => {
    await openStartPageWithBanner(page)

    await banner(page)
      .getByRole('button', { name: 'Reject analytics cookies' })
      .click()

    await expectBannerRemainsHidden(page)
  })

  test('Should take the visitor to the cookies page from the banner', async ({
    page
  }) => {
    await openStartPageWithBanner(page)

    await banner(page).getByRole('link', { name: 'View cookies' }).click()

    await expect(
      page.getByRole('heading', { level: 1, name: 'Cookies', exact: true })
    ).toBeVisible()
  })
})
