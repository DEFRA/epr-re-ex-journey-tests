import { test, expect } from '@playwright/test'

import { DashboardPage } from 'page-objects/dashboard.page.js'
import config from '~/test/config/config.js'
import { loginViaHomePageReal } from '~/test/support/login-helper.js'
import { requireValue } from '~/test/support/required-value.js'

const environment = process.env.ENVIRONMENT

// This suite otherwise always signs an operator in via the Defra ID stub
// (test/config/config.js explains why real Defra ID sign-in is a gap it
// otherwise leaves open). ext-test is the only environment that both wires
// epr-frontend to real GOV.UK One Login and has an account this suite holds
// credentials for, so this spec skips itself everywhere else rather than
// fail on a sign-in form/account that doesn't exist there.
test.describe('Operator smoketest @smoketest @extTestOnly', () => {
  test('Should be able to sign in as an operator, reach the operator home page, and sign out @operatorSmoketest', async ({
    page
  }) => {
    test.skip(
      environment !== 'ext-test',
      'Real GOV.UK One Login sign-in is only wired up against ext-test.'
    )

    const dashboardPage = new DashboardPage(page)

    await loginViaHomePageReal(
      page,
      requireValue(config.defraIdUser.username, 'DEFRA_ID_USERNAME'),
      requireValue(config.defraIdUser.password, 'DEFRA_ID_PASSWORD')
    )

    // The redirect chain lands on the operator's own organisation page.
    expect(page.url()).toContain('/organisations/')
    expect(await dashboardPage.dashboardHeaderText()).not.toBe('')

    // Record the landing page URL before signing out, so we can prove the
    // session was actually terminated server-side (not just that the sign
    // out link was clicked) by trying to revisit it afterwards.
    const landingPageUrl = page.url()

    await dashboardPage.signOutLink().click()
    await expect(page).toHaveTitle(/Signed out/)
    // The "logged out" page's h1 is govuk-heading-l, not the -xl every other
    // page under test uses (which is what Page#headingText targets).
    await expect(page.locator('h1')).toHaveText('You have signed out')

    await page.goto(landingPageUrl)
    expect(page.url()).not.toBe(landingPageUrl)
    await expect(page).toHaveTitle(/Signed out/)
  })
})
