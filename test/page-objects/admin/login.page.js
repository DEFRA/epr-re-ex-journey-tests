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

  // Deletes cookies first so a stale session from an earlier spec/it block
  // can't skip the login form entirely.
  async loginAsServiceMaintainer(
    username = config.auth.username,
    password = config.auth.password
  ) {
    if (process.env.ENVIRONMENT === 'test') {
      await this.open()
      this.enterCredentialsMSLogin(username, password)
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

    await this.page.locator('input[value="Yes"]').click()
  }

  async submitCredentials() {
    await this.page.locator('button[type=submit]').click()
  }
}

export { AdminLoginPage }
