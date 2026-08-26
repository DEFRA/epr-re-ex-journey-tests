import { test, expect } from '@playwright/test'

// Every other spec runs with consent already answered, seeded in
// playwright.config.js, so this is the only place the banner is seen. Clearing
// storage state is what puts a browser back into the state a first-time visitor
// arrives in.
test.use({ storageState: { cookies: [], origins: [] } })

const GOOGLE_TAG = 'https://www.googletagmanager.com/**'

/**
 * Keeps a suite run out of the analytics property while still proving the tag
 * was asked for. Returns the requests the page tried to make.
 * @param {import('@playwright/test').Page} page
 */
const blockAndRecordTagRequests = async (page) => {
  /** @type {string[]} */
  const attempted = []

  await page.route(GOOGLE_TAG, (route) => {
    attempted.push(route.request().url())
    return route.abort()
  })

  return attempted
}

test.describe('Cookie consent @cookieConsent', () => {
  test('Should ask a first-time visitor before loading analytics', async ({
    page
  }) => {
    const attempted = await blockAndRecordTagRequests(page)
    await page.goto('/start')

    const banner = page.getByRole('region', { name: /cookies on/i })

    await expect(banner).toBeVisible()
    await expect(
      banner.getByRole('button', { name: 'Accept analytics cookies' })
    ).toBeVisible()
    await expect(
      banner.getByRole('button', { name: 'Reject analytics cookies' })
    ).toBeVisible()
    expect(attempted).toStrictEqual([])
  })

  test('Should load analytics once the visitor accepts', async ({ page }) => {
    const attempted = await blockAndRecordTagRequests(page)
    await page.goto('/start')

    await page.getByRole('button', { name: 'Accept analytics cookies' }).click()

    await expect(page.getByRole('region', { name: /cookies on/i })).toBeHidden()
    await expect.poll(() => attempted.length).toBeGreaterThan(0)
  })

  test('Should not load analytics when the visitor rejects', async ({
    page
  }) => {
    const attempted = await blockAndRecordTagRequests(page)
    await page.goto('/start')

    await page.getByRole('button', { name: 'Reject analytics cookies' }).click()

    await expect(page.getByRole('region', { name: /cookies on/i })).toBeHidden()
    await page.goto('/start')

    expect(attempted).toStrictEqual([])
  })
})
