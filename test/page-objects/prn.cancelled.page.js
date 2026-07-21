import { $ } from '@wdio/globals'
import { Page } from 'page-objects/page'

class PRNCancelledPage extends Page {
  async statusText() {
    const prnNoElement = await $(
      '#main-content > div > div > div > div > strong'
    )
    await prnNoElement.waitForExist({ timeout: 5000 })
    return await prnNoElement.getText()
  }

  async returnToHomePage() {
    await $('a*=Return to home').click()
  }

  async pernsPage() {
    await $('a*=PERNs page').click()
  }

  async prnsPage() {
    await $('a*=PRNs page').click()
  }
}

export default new PRNCancelledPage()
