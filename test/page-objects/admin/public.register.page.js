import { AdminPage } from 'page-objects/admin/page'
import { $ } from '@wdio/globals'

class PublicRegisterPage extends AdminPage {
  open() {
    return super.open('/public-register')
  }

  async downloadPublicRegister() {
    return await $('#main-content > div > div > div > form > button').click()
  }

  async downloadPublicRegisterButtonExistence() {
    return await $(
      '#main-content > div > div > div > form > button'
    ).isExisting()
  }

  async fetchCsv() {
    return super.fetchCsv('/public-register')
  }
}

export default new PublicRegisterPage()
