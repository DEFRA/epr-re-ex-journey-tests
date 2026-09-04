import { HomePage } from 'page-objects/homepage.js'
import { DefraIdStubPage } from 'page-objects/defra.id.stub.page.js'
import { registerAndLinkDefraIdUser } from './defra-id-linking.js'
import { signInAtGovUkOneLogin } from './govuk-one-login.js'

export { registerAndLinkDefraIdUser }

/**
 * Drives the UI login flow via the Defra ID stub, starting from the home
 * page's "Start now" button.
 * @param {import('@playwright/test').Page} page
 * @param {string} email
 */
export async function loginViaHomePage(page, email) {
  const homePage = new HomePage(page)
  const defraIdStubPage = new DefraIdStubPage(page)

  await homePage.openStart()
  await homePage.startNowButton().click()
  await defraIdStubPage.loginViaEmail(email)
}

/**
 * Drives the UI login flow via the real GOV.UK One Login (Defra ID) sign-in
 * form, starting from the home page's "Start now" button. Only meaningful
 * where epr-frontend is wired to real Defra ID and the account already
 * exists there - today that's ext-test only, exercised solely by the
 * operator smoketest.
 * @param {import('@playwright/test').Page} page
 * @param {string} username
 * @param {string} password
 */
export async function loginViaHomePageReal(page, username, password) {
  const homePage = new HomePage(page)

  await homePage.openStart()
  await homePage.startNowButton().click()
  await signInAtGovUkOneLogin(page, username, password)
}

/**
 * Convenience wrapper combining registerAndLinkDefraIdUser and
 * loginViaHomePage for the common case where nothing needs to happen
 * between linking the user and logging in.
 * @param {import('@playwright/test').Page} page
 * @param {string} organisationRefNo
 * @param {string} email
 */
export async function createLinkAndLogin(page, organisationRefNo, email) {
  const user = await registerAndLinkDefraIdUser(organisationRefNo, email)
  await loginViaHomePage(page, email)
  return user
}
