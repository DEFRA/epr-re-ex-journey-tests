import { Page } from 'page-objects/page'

// The page epr-frontend shows at sign-in, when the identity holds no role this
// service knows. Sign-in is the one point that establishes that, so this page
// states the cause. A refusal met afterwards states none, and is read through
// NoPermissionPage instead.
class NotAuthorisedPage extends Page {
  async getHeadingText() {
    return this.page.locator('main h1').innerText()
  }

  async getBodyText() {
    return this.page.locator('[data-testid="app-page-body"]').innerText()
  }
}

export { NotAuthorisedPage }
