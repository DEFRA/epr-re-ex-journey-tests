import { AdminPage } from 'page-objects/admin/page'

class PublicRegisterPage extends AdminPage {
  open() {
    return super.open('/public-register')
  }

  get downloadPublicRegisterButton() {
    return this.page.getByRole('button', {
      name: 'Download public register',
      exact: true
    })
  }

  async downloadPublicRegister() {
    return this.downloadPublicRegisterButton.click()
  }

  async fetchCsv() {
    return super.fetchCsv('/public-register')
  }
}

export { PublicRegisterPage }
