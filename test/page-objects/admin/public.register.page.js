import { AdminPage } from 'page-objects/admin/page'

class PublicRegisterPage extends AdminPage {
  open() {
    return super.open('/public-register')
  }

  get downloadPublicRegisterButton() {
    return this.page.locator('#main-content > div > div > div > form > button')
  }

  async downloadPublicRegister() {
    return this.downloadPublicRegisterButton.click()
  }

  async fetchCsv() {
    return super.fetchCsv('/public-register')
  }
}

export { PublicRegisterPage }
