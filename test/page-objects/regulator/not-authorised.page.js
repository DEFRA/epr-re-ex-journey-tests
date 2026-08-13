import { Page } from 'page-objects/page'

// The page epr-frontend shows an Entra user it will not serve. It is reached
// two ways: at sign-in, when the identity holds no role this service knows,
// and afterwards, when a regulator tries to change operator data.
class NotAuthorisedPage extends Page {
  async getHeadingText() {
    return this.page.locator('main h1').innerText()
  }

  async getBodyText() {
    return this.page.locator('[data-testid="app-page-body"]').innerText()
  }
}

export { NotAuthorisedPage }
