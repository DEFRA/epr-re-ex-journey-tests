import { clickAndAwaitRedirectChain } from './redirect-settle.js'

/**
 * Fills in Microsoft's own sign-in form and waits for the redirect chain to
 * settle. Shared by every page object that signs an Entra identity in, because
 * the form belongs to Microsoft rather than to any one of our applications.
 *
 * The wait matters: real Entra's chain (login.microsoftonline.com -> the app's
 * callback -> the landing page) is longer than the stub's, so a caller that
 * acts immediately - an axe scan, for instance - otherwise runs while the
 * navigation is still in flight and meets axe-core's "Execution context was
 * destroyed".
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} username
 * @param {string} password
 */
export async function signInAtMicrosoft(page, username, password) {
  await page.locator('#i0116').fill(username)
  await page.locator('#idSIButton9').click()

  await page.locator('#i0118').fill(password)
  await page.locator('input[value="Sign in"]').click()

  await clickAndAwaitRedirectChain(page, () =>
    page.locator('input[value="Yes"]').click()
  )
}
