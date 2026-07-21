import { $ } from '@wdio/globals'
import { Page } from 'page-objects/page'
import { checkDoubleClickPrevented } from '../support/double-click.js'

class PRNViewPage extends Page {
  async headingText() {
    const element = await $('h1.govuk-heading-xl')
    await element.waitForExist({ timeout: 10000 })
    return await element.getText()
  }

  async returnToPRNList() {
    await $('a*=Return to PRN list').click()
  }

  async returnToPERNList() {
    await $('a*=Return to PERN list').click()
  }

  async cancelPRNButton() {
    await $('#main-content > div > div > a').click()
  }

  async deletePRNButton() {
    await $('#main-content > div > div > form > div > a').click()
  }

  async issuePRNButton() {
    await $('#main-content > div > div > form > div > button').click()
  }

  async issueAndCheckDoubleClickPrevented() {
    await checkDoubleClickPrevented(
      '#main-content > div > div > form > div > button'
    )
  }
}

export default new PRNViewPage()
