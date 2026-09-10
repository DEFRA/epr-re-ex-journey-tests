import { Page } from 'page-objects/page'
import config from '~/test/config/config.js'
import { signInAtMicrosoft } from '~/test/support/entra-login.js'
import { requireValue } from '~/test/support/required-value.js'

import { RegulatorLoginPage } from './login.page'

// The bookmarkable landing page a regulator starts from: no session assumed,
// just a heading and a GOV.UK "Start now" button that begins the Entra ID
// sign-in round trip at /regulators/login. Unlike RegulatorLoginPage.login(),
// which opens /regulators/login directly, loginAsRegulator() here follows the
// real user journey through that button click.
class RegulatorStartPage extends Page {
  open() {
    return super.open('/regulators/start')
  }

  startNowButton() {
    return this.page.getByRole('button', { name: 'Start now', exact: true })
  }

  async clickStartNow() {
    await this.startNowButton().click()
  }

  // The identity this service recognises, by its one app role - reached via
  // the "Start now" button rather than RegulatorLoginPage's short-circuit
  // direct navigation to /regulators/login.
  async loginAsRegulator() {
    const username = requireValue(
      config.regulatorUser.username,
      'REGULATOR_USERNAME'
    )
    const password = requireValue(
      config.regulatorUser.password,
      'REGULATOR_PASSWORD'
    )

    if (config.usesRealEntra) {
      await this.open()
      await this.clickStartNow()
      await signInAtMicrosoft(this.page, username, password)
    } else {
      // The stub path deletes cookies first so a stale session from an
      // earlier test cannot skip the sign-in form entirely.
      await this.page.context().clearCookies()
      await this.open()
      await this.clickStartNow()

      const loginPage = new RegulatorLoginPage(this.page)
      await loginPage.enterCredentials(username, password)
      await loginPage.submitCredentials()
    }
  }
}

export { RegulatorStartPage }
