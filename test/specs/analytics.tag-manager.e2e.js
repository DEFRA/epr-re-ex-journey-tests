import { test, expect } from '@playwright/test'

/**
 * @import { Page } from '@playwright/test'
 */

/**
 * Answers every request for a tag manager script with an empty one, so the
 * suite never reaches Google, and records what was asked for.
 * @param {Page} page
 */
const interceptTagManager = async (page) => {
  /** @type {string[]} */
  const requested = []

  await page.route(/googletagmanager\.com/, (route) => {
    requested.push(route.request().url())
    return route.fulfill({ contentType: 'text/javascript', body: '' })
  })

  return requested
}

/**
 * @param {Page} page
 * @param {'Accept' | 'Reject'} choice
 */
const answerBanner = async (page, choice) => {
  await page.goto('/start')
  await page
    .getByRole('button', { name: `${choice} analytics cookies` })
    .click()
}

/**
 * Names each entry on the queue: a command by its name, a plain push by its
 * keys. The container reads the queue in order, so the order is the contract.
 * @param {Page} page
 */
const queued = (page) =>
  page.evaluate(() =>
    /** @type {unknown[]} */ (Reflect.get(window, 'dataLayer') ?? []).map(
      (entry) =>
        Object.prototype.toString.call(entry) === '[object Arguments]'
          ? `command ${/** @type {IArguments} */ (entry)[0]}`
          : Object.keys(/** @type {object} */ (entry)).join(' ')
    )
  )

test.describe('Analytics tag manager @analytics', () => {
  test('Should load nothing from Google before the visitor answers', async ({
    page
  }) => {
    const requested = await interceptTagManager(page)

    await page.goto('/start')

    expect(requested).toStrictEqual([])
  })

  test('Should load nothing from Google once the visitor rejects', async ({
    page
  }) => {
    const requested = await interceptTagManager(page)

    await answerBanner(page, 'Reject')
    await page.goto('/start')

    expect(requested).toStrictEqual([])
  })

  test('Should load the container only behind the controls once the visitor accepts', async ({
    page
  }) => {
    const requested = await interceptTagManager(page)

    await answerBanner(page, 'Accept')
    await page.goto('/start')
    await expect.poll(() => requested.length).toBeGreaterThan(0)

    const containerId = await page
      .locator('meta[name="analytics-container-id"]')
      .getAttribute('content')

    expect(requested).toStrictEqual([
      `https://www.googletagmanager.com/gtm.js?id=${containerId}`
    ])
    expect(await queued(page)).toStrictEqual([
      'gtm.blocklist',
      'command policy',
      'command consent',
      'command set',
      'gtm.start event'
    ])
  })
})
