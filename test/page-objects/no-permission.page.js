import { Page } from 'page-objects/page'

// The page epr-frontend shows a signed-in user who meets a refusal. It states
// that permission is absent and no more, because all the service knows at that
// point is that the request was refused. Both populations reach it, so it is
// not a regulator page.
class NoPermissionPage extends Page {
  async getHeadingText() {
    return this.page.locator('main h1').innerText()
  }

  async getBodyText() {
    return this.page.locator('[data-testid="app-page-body"]').innerText()
  }
}

export { NoPermissionPage }
