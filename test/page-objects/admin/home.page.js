import { AdminPage } from 'page-objects/admin/page'
import { $ } from '@wdio/globals'

class HomePage extends AdminPage {
  open() {
    return super.open('/')
  }

  async getWelcomeText() {
    return $('main h1').getText()
  }
}

export default new HomePage()
