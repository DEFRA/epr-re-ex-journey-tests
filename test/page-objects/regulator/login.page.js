import { Page } from 'page-objects/page'

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

  async login(username, password) {
    await this.open()
    await this.enterCredentials(username, password)
    await this.submitCredentials()
  }

  // Used after sign-out to confirm we're actually looking at the sign-in
  // form again, rather than just having navigated somewhere unauthenticated.
  isDisplayed() {
    return this.page.locator('#username').isVisible()
  }
}

export { RegulatorLoginPage }
