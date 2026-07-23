import { AdminPage } from 'page-objects/admin/page'

class PublicRegisterPage extends AdminPage {
  open() {
    return super.open('/public-register')
  }

  async downloadPublicRegister() {
    return this.page
      .locator('#main-content > div > div > div > form > button')
      .click()
  }

  async downloadPublicRegisterButtonExistence() {
    return (
      (await this.page
        .locator('#main-content > div > div > div > form > button')
        .count()) > 0
    )
  }

  async fetchCsv() {
    return super.fetchCsv('/public-register')
  }
}

export { PublicRegisterPage }
