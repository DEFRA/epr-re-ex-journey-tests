import { $ } from '@wdio/globals'
import { Page } from 'page-objects/page'

class PRNCreatedPage extends Page {
  async pernsPageLink() {
    await $('a*=PERNs page').click()
  }

  async prnsPageLink() {
    await $('a*=PRNs page').click()
  }

  async returnToRegistrationPage() {
    await $('a*=Return to home').click()
  }
}

export default new PRNCreatedPage()
