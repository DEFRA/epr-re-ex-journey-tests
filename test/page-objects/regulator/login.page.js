import { Page } from 'page-objects/page'
import config from '~/test/config/config.js'
import { signInAtMicrosoft } from '~/test/support/entra-login.js'
import { requireValue } from '~/test/support/required-value.js'

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

  // The identity this service recognises, by its one app role.
  async loginAsRegulator() {
    await this.login(
      requireValue(config.regulatorUser.username, 'REGULATOR_USERNAME'),
      requireValue(config.regulatorUser.password, 'REGULATOR_PASSWORD')
    )
  }

  // An Entra identity that holds no app role this service knows. Sign-in
  // succeeds against the provider and the service still refuses it.
  async loginAsUnrecognisedUser() {
    await this.login(
      requireValue(
        config.unrecognisedEntraUser.username,
        'UNRECOGNISED_ENTRA_USERNAME'
      ),
      requireValue(
        config.unrecognisedEntraUser.password,
        'UNRECOGNISED_ENTRA_PASSWORD'
      )
    )
  }

  // The stub path deletes cookies first so a stale session from an earlier
  // test cannot skip the sign-in form entirely.
  async login(username, password) {
    if (config.usesRealEntra) {
      await this.open()
      await signInAtMicrosoft(this.page, username, password)
    } else {
      await this.page.context().clearCookies()
      await this.open()
      await this.enterCredentials(username, password)
      await this.submitCredentials()
    }

    await this.rejectAnalyticsCookies()
  }

  // Used after sign-out to confirm we're actually looking at the sign-in
  // form again, rather than just having navigated somewhere unauthenticated.
  isDisplayed() {
    return this.page.locator('#username').isVisible()
  }
}

export { RegulatorLoginPage }
