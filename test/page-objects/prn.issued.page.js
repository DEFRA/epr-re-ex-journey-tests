import { $ } from '@wdio/globals'
import { Page } from 'page-objects/page'

class PRNIssuedPage extends Page {
  async prnNumberText() {
    const prnNoElement = await $(
      '#main-content > div > div > div > div > strong'
    )
    await prnNoElement.waitForExist({ timeout: 5000 })
    return await prnNoElement.getText()
  }

  async issueAnotherPRN() {
    const issueAnotherPRNelement = await $(
      '#main-content > div > div > p:nth-child(4) > a'
    )
    await issueAnotherPRNelement.waitForExist({ timeout: 5000 })
    return issueAnotherPRNelement
  }

  async managePRNs() {
    const managePRNsElement = await $(
      '#main-content > div > div > p:nth-child(5) > a'
    )
    await managePRNsElement.waitForExist({ timeout: 5000 })
    return managePRNsElement
  }

  async returnToHomePage() {
    await $('a*=Return to home').click()
  }

  async viewPdfButton() {
    await $('#main-content > div > div > p:nth-child(3) > a').click()
  }
}

export default new PRNIssuedPage()
