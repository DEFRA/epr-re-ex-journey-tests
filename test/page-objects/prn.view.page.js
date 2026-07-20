import { $, $$ } from '@wdio/globals'
import { checkDoubleClickPrevented } from '../support/double-click.js'

class PRNViewPage {
  async headingText() {
    const element = await $('h1.govuk-heading-xl')
    await element.waitForExist({ timeout: 10000 })
    return await element.getText()
  }

  async prnDetails() {
    const summaryRows = await $$(
      'dl.govuk-summary-list:nth-of-type(1) > div.govuk-summary-list__row'
    )
    return await this.toDataMap(summaryRows)
  }

  async accreditationDetails() {
    const summaryRows = await $$(
      'dl.govuk-summary-list:nth-of-type(2) > div.govuk-summary-list__row'
    )
    return await this.toDataMap(summaryRows)
  }

  async toDataMap(summaryRows) {
    const dataMap = {}

    for (const row of summaryRows) {
      const key = await row.$('.govuk-summary-list__key').getText()
      const value = await row.$('.govuk-summary-list__value').getText()
      dataMap[key] = value
    }
    return dataMap
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
