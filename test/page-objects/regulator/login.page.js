import { Page } from 'page-objects/page'
import config from '~/test/config/config.js'
import { signInAtMicrosoft } from '~/test/support/entra-login.js'

// epr-frontend serves the regulator routes itself (unlike
// epr-re-ex-admin-frontend, which is a separate host/port), so this extends
// the base Page directly and relies on the global Playwright baseURL.
class RegulatorLoginPage extends Page {
  open() {
    return super.open('/regulators/login')
  }

  async enterCredentials(username, password) {
    await this.page.locator('#username').fill(username)
    await this.page.locator('#password').fill(password)
  }

  async submitCredentials() {
    await this.page.locator('button[type=submit]').click()
  }

  // The stub path deletes cookies first so a stale session from an earlier
  // test cannot skip the sign-in form entirely.
  async login(
    username = config.regulatorUser.username,
    password = config.regulatorUser.password
  ) {
    if (config.usesRealEntra) {
      await this.open()
      await signInAtMicrosoft(this.page, username, password)
    } else {
      await this.page.context().clearCookies()
      await this.open()
      await this.enterCredentials(username, password)
      await this.submitCredentials()
    }
  }

  // An Entra identity that holds no app role this service recognises. Sign-in
  // succeeds against the provider and the service still refuses it.
  async loginAsUnrecognisedUser() {
    await this.login(
      config.unrecognisedEntraUser.username,
      config.unrecognisedEntraUser.password
    )
  }

  // Used after sign-out to confirm we're actually looking at the sign-in
  // form again, rather than just having navigated somewhere unauthenticated.
  isDisplayed() {
    return this.page.locator('#username').isVisible()
  }
}

export { RegulatorLoginPage }
