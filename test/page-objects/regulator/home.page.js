import { Page } from 'page-objects/page'

class RegulatorHomePage extends Page {
  async getWelcomeText() {
    return this.page.locator('main h1').innerText()
  }
}

export { RegulatorHomePage }
