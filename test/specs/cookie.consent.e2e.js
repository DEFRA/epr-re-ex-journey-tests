import { test, expect } from '@playwright/test'

import { checkAccessibility } from '../support/accessibility.js'

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

const MEASUREMENT_COOKIE_VALUE = 'GA1.1.111.222'
const SHARED_PARENT_DOMAIN = '.defra.cloud'

/**
 * Host-only, across the whole site.
 * @param {Page} page
 */
const setCookiesAsTheMeasurementTagWould = (page) =>
  page.context().addCookies(
    ['_ga', '_ga_TESTONLY01'].map((name) => ({
      name,
      value: MEASUREMENT_COOKIE_VALUE,
      url: new URL('/', page.url()).href
    }))
  )

/**
 * Where earlier releases shared `_ga` with every service on the parent domain.
 * Localhost has no parent domain, so there is nothing to plant there.
 * @param {Page} page
 */
const setTheCookieEarlierReleasesSharedAcrossTheParentDomain = async (page) => {
  if (!new URL(page.url()).hostname.endsWith(SHARED_PARENT_DOMAIN)) {
    return
  }

  await page.context().addCookies([
    {
      name: '_ga',
      value: MEASUREMENT_COOKIE_VALUE,
      domain: SHARED_PARENT_DOMAIN,
      path: '/'
    }
  ])
}

// What server.inject cannot reach: that the buttons submit without
// javascript, that a real browser keeps the consent cookie and sends it back
// on the next navigation, and that it drops the analytics cookies the service
// expires, on this host and on the parent domain.
test.describe('Cookie consent @cookieConsent', () => {
  test('Should remember on the next page that the visitor accepted analytics cookies', async ({
    page
  }) => {
    /** @type {string[]} */
    const tagManagerRequests = []
    await page.route(/googletagmanager\.com/, (route) => {
      tagManagerRequests.push(route.request().url())
      return route.fulfill({ contentType: 'text/javascript', body: '' })
    })

    await openStartPageWithBanner(page)
    await checkAccessibility(page, 'Start page')
    await banner(page)
      .getByRole('button', { name: 'Accept analytics cookies' })
      .click()
    await expect(banner(page).getByRole('alert')).toContainText(
      "You've accepted analytics cookies."
    )

    tagManagerRequests.length = 0
    await page.goto('/start')

    await expect(banner(page)).toBeHidden()
    await expect.poll(() => tagManagerRequests.length).toBeGreaterThan(0)
  })

  test('Should delete the analytics cookies when the visitor withdraws consent', async ({
    page
  }) => {
    await openStartPageWithBanner(page)
    await banner(page)
      .getByRole('button', { name: 'Accept analytics cookies' })
      .click()
    await setCookiesAsTheMeasurementTagWould(page)
    await setTheCookieEarlierReleasesSharedAcrossTheParentDomain(page)

    await page.goto('/cookies')
    await page
      .getByRole('radio', {
        name: 'Do not use cookies that measure my service use',
        exact: true
      })
      .check()
    await page.getByRole('button', { name: 'Save cookie settings' }).click()
    await expect(page.getByRole('alert')).toContainText(
      "You've set your cookie preferences."
    )

    const names = (await page.context().cookies()).map(({ name }) => name)

    expect(names.filter((name) => name.startsWith('_ga'))).toStrictEqual([])
  })
})
