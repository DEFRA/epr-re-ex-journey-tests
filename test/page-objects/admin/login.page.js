import { AdminPage } from 'page-objects/admin/page'
import config from '~/test/config/config.js'

class AdminLoginPage extends AdminPage {
  open() {
    return super.open('/auth/sign-in')
  }

  async enterCredentials(username, password) {
    await this.page.locator('#username').fill(username)
    await this.page.locator('#password').fill(password)
  }

  // The stub path deletes cookies first so a stale session from an earlier
  // spec/it block can't skip the login form entirely.
  async loginAsServiceMaintainer(
    username = config.auth.username,
    password = config.auth.password
  ) {
    if (config.usesRealEntra) {
      await this.open()
      await this.enterCredentialsMSLogin(username, password)
    } else {
      await this.page.context().clearCookies()
      await this.open()
      await this.enterCredentials(username, password)
      await this.submitCredentials()
    }
  }

  async enterCredentialsMSLogin(username, password) {
    await this.page.locator('#i0116').fill(username)
    await this.page.locator('#idSIButton9').click()

    await this.page.locator('#i0118').fill(password)
    await this.page.locator('input[value="Sign in"]').click()

    // As with submitCredentials() below, wait for the final leg of the
    // redirect chain (login.microsoftonline.com -> app callback -> Home) to
    // actually settle before returning - real Entra's chain is longer than
    // the stub's, so a caller that acts immediately (e.g. an axe scan) is
    // even more likely to hit axe-core's "Execution context was destroyed"
    // if this click's navigation is still in flight.
    const urlBeforeClick = this.page.url()
    await this.page.locator('input[value="Yes"]').click()
    await this.page.waitForURL((url) => url.toString() !== urlBeforeClick, {
      timeout: 15000
    })
    await this.page.waitForLoadState('networkidle', { timeout: 15000 })
  }

  // Waits for the resulting navigation to actually complete before
  // returning. Needed because the sign-in POST redirects through to the
  // Home page, and a caller that acts immediately (e.g. an axe scan) can
  // otherwise run while that navigation is still settling - Playwright's
  // click() only waits for the click itself, not any follow-on redirect
  // chain - which surfaces as axe-core's page.evaluate throwing "Execution
  // context was destroyed, most likely because of a navigation".
  async submitCredentials() {
    const urlBeforeClick = this.page.url()
    await this.page.locator('button[type=submit]').click()
    await this.page.waitForURL((url) => url.toString() !== urlBeforeClick, {
      timeout: 15000
    })
    await this.page.waitForLoadState('networkidle', { timeout: 15000 })
  }
}

export { AdminLoginPage }
