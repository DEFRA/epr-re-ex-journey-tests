import { Page } from 'page-objects/page'

// The page epr-frontend shows a regulator who holds no session, whether they
// signed out or their session lapsed.
class RegulatorLoggedOutPage extends Page {
  async getHeadingText() {
    return this.page.locator('main h1').innerText()
  }

  async getBodyText() {
    return this.page.locator('main p.govuk-body').innerText()
  }

  signInAgainLink() {
    return this.page.getByRole('button', { name: 'Sign in again', exact: true })
  }
}

export { RegulatorLoggedOutPage }
