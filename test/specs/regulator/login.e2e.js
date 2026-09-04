import { test, expect } from '@playwright/test'

import { RegulatorLoginPage } from 'page-objects/regulator/login.page'
import { RegulatorHomePage } from 'page-objects/regulator/home.page'
import { ServiceNavigation } from 'page-objects/service-navigation.page'

test.describe('Regulator login @regulator @smoketest', () => {
  test('Should be able to sign in as a regulator, reach the landing page, and sign out @regulatorLogin', async ({
    page
  }) => {
    const loginPage = new RegulatorLoginPage(page)
    const homePage = new RegulatorHomePage(page)
    const serviceNavigation = new ServiceNavigation(page)

    await loginPage.loginAsRegulator()

    // The landing page is the organisation list, which is what the heading
    // names. The route stays "Home".
    expect(await homePage.getHeadingText()).toBe('All organisations')

    // A regulator reads what operators record and records nothing, so the
    // service names itself for reading and offers them no operator controls.
    expect(await serviceNavigation.serviceName()).toBe(
      'Check reprocessed or exported packaging waste'
    )
    expect(await serviceNavigation.serviceUrl()).toBe('/regulators/home')
    // The landing page is their home, so the navigation names it once.
    expect(await serviceNavigation.linkTexts()).toEqual(['Home', 'Sign out'])

    // Record the landing page URL before signing out, so we can prove the
    // session was actually terminated server-side (not just that the sign
    // out link was clicked) by trying to revisit it afterwards.
    const landingPageUrl = page.url()

    await homePage.signOutLink().click()
    await expect(page).toHaveTitle(/Signed out/)

    // Attempting to access the landing page again should result in a redirection
    // to signed out page.
    await page.goto(landingPageUrl)
    expect(page.url()).not.toBe(landingPageUrl)
    await expect(page).toHaveTitle(/Signed out/)
  })
})
