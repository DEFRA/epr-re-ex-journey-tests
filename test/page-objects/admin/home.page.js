import { AdminPage } from 'page-objects/admin/page'

class HomePage extends AdminPage {
  open() {
    return super.open('/')
  }

  async getWelcomeText() {
    return this.page.locator('main h1').innerText()
  }
}

export { HomePage }
