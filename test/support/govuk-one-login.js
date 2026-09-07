import { clickAndAwaitRedirectChain } from './redirect-settle.js'

/**
 * Fills in GOV.UK One Login's own sign-in form - the real Defra ID provider
 * epr-frontend uses in dev, ext-test and prod - and waits for the redirect
 * chain back to the app to settle. Shared the same way signInAtMicrosoft is
 * shared for Entra: the form belongs to GOV.UK One Login, not to any app
 * under test.
 *
 * Assumes the caller has already reached the "Create your GOV.UK One Login
 * or sign in" page (e.g. by clicking the app's "Start now" button).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} email
 * @param {string} password
 */
export async function signInAtGovUkOneLogin(page, email, password) {
  await page.locator('#sign-in-button').click()

  await page.locator('#email').fill(email)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()

  await page.locator('#password').fill(password)

  await clickAndAwaitRedirectChain(page, () =>
    page.getByRole('button', { name: 'Continue', exact: true }).click()
  )
}
