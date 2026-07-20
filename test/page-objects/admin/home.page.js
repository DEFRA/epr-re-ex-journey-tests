import { AdminPage } from 'page-objects/admin/page'
import { $ } from '@wdio/globals'

class HomePage extends AdminPage {
  open() {
    return super.open('/')
  }

  async signOut() {
    await $('a*=Sign out').click()
  }
}

export default new HomePage()
