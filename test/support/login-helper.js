import HomePage from 'page-objects/homepage.js'
import DefraIdStubPage from 'page-objects/defra.id.stub.page.js'
import { createAndRegisterDefraIdUser, linkDefraIdUser } from './apicalls.js'

/**
 * Registers a Defra ID user for the given email and links them to the
 * organisation. Returns the user so callers that need user.userId for
 * further seeding (e.g. seedSubmittedReport) before logging in still can.
 * @param {string} organisationRefNo
 * @param {string} email
 */
export async function registerAndLinkDefraIdUser(organisationRefNo, email) {
  const user = await createAndRegisterDefraIdUser(email)
  await linkDefraIdUser(organisationRefNo, user.userId, email)
  return user
}

/**
 * Drives the UI login flow via the Defra ID stub, starting from the home
 * page's "Start now" button.
 * @param {string} email
 */
export async function loginViaHomePage(email) {
  await HomePage.openStart()
  await HomePage.clickStartNow()
  await DefraIdStubPage.loginViaEmail(email)
}

/**
 * Convenience wrapper combining registerAndLinkDefraIdUser and
 * loginViaHomePage for the common case where nothing needs to happen
 * between linking the user and logging in.
 * @param {string} organisationRefNo
 * @param {string} email
 */
export async function createLinkAndLogin(organisationRefNo, email) {
  const user = await registerAndLinkDefraIdUser(organisationRefNo, email)
  await loginViaHomePage(email)
  return user
}
