import { test, expect } from '@playwright/test'

import { RegulatorLoginPage } from 'page-objects/regulator/login.page'
import { RegulatorHomePage } from 'page-objects/regulator/home.page'

test.describe('Regulator login @regulator', () => {
  //TODO:Skip for now
  test.skip('Should be able to sign in as a regulator, reach the landing page, and sign out @regulatorlogin', async ({
    page
  }) => {
    const loginPage = new RegulatorLoginPage(page)
    const homePage = new RegulatorHomePage(page)

    await loginPage.login('standard.regulator@test.gov.uk', 'pass')

    const welcomeText = await homePage.getWelcomeText()
    expect(welcomeText).toBe('Regulators home')

    // Record the landing page URL before signing out, so we can prove the
    // session was actually terminated server-side (not just that the sign
    // out link was clicked) by trying to revisit it afterwards.
    const landingPageUrl = page.url()

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)

    // Attempting to access the landing page again should result in a redirection
    // to signed out page.
    await page.goto(landingPageUrl)
    expect(page.url()).not.toBe(landingPageUrl)
    await expect(page).toHaveTitle(/Signed out/)
  })
})
