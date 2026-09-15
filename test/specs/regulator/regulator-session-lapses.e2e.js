import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'

import { RegulatorHomePage } from 'page-objects/regulator/home.page'
import { RegulatorLoggedOutPage } from 'page-objects/regulator/logged-out.page'
import { RegulatorLoginPage } from 'page-objects/regulator/login.page'
import { ServiceNavigation } from 'page-objects/service-navigation.page'

const REGULATOR_SERVICE =
  'Record reprocessed or exported packaging waste: regulators'

/**
 * The session cookie expires long before the cookie that remembers a regulator
 * signed in, so a lapsed session leaves the browser holding everything else.
 * @param {import('@playwright/test').Page} page
 */
const lapseSession = (page) =>
  page.context().clearCookies({ name: 'userSession' })

/**
 * @param {import('@playwright/test').Page} page
 */
const expectRegulatorSignedOutPage = async (page) => {
  const loggedOutPage = new RegulatorLoggedOutPage(page)
  const serviceNavigation = new ServiceNavigation(page)

  await expect(page).toHaveTitle(/Signed out/)
  expect(await loggedOutPage.getHeadingText()).toBe('You have signed out')
  expect(await loggedOutPage.getBodyText()).toBe(
    `You have signed out of the '${REGULATOR_SERVICE}' service.`
  )
  // The operator's way back in is Defra ID, which a regulator cannot use.
  await expect(loggedOutPage.signInAgainLink()).toHaveAttribute(
    'href',
    '/regulators/login'
  )
  expect(await serviceNavigation.serviceName()).toBe(REGULATOR_SERVICE)
}

test.describe('A regulator whose session lapses @regulator', () => {
  test('is sent to the regulator signed-out page from a page operators also use @regulatorSessionLapse', async ({
    page
  }) => {
    const loginPage = new RegulatorLoginPage(page)
    const homePage = new RegulatorHomePage(page)

    await loginPage.loginAsRegulator()
    // Settle on the landing page, so the session exists before it lapses.
    expect(await homePage.getHeadingText()).toBe('All organisations')

    await lapseSession(page)

    // Organisation pages serve operators and regulators alike, so the address
    // alone cannot say which signed-out page is due.
    await page.goto(`/organisations/${randomUUID()}`)

    await expectRegulatorSignedOutPage(page)
  })

  test('is sent to the regulator signed-out page when they sign out after it lapsed @regulatorSessionLapse', async ({
    page
  }) => {
    const loginPage = new RegulatorLoginPage(page)
    const homePage = new RegulatorHomePage(page)

    await loginPage.loginAsRegulator()
    expect(await homePage.getHeadingText()).toBe('All organisations')

    await lapseSession(page)

    // The page they were reading is still on screen, sign out link and all.
    await homePage.signOutLink().click()

    await expectRegulatorSignedOutPage(page)
  })
})
