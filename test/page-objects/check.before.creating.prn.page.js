/// <reference types="@wdio/globals/types" />
import { browser, $, $$ } from '@wdio/globals'

class CheckBeforeCreatingPRNPage {
  async headingText() {
    const element = await $('h1.govuk-heading-xl')
    await browser.waitUntil(
      async () => (await element.getText()).includes('Check before'),
      { timeout: 10000 }
    )
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

  async createPRN() {
    await $('#main-content button[type=submit]').click()
  }

  async discardAndStartAgain() {
    await $('a=Discard and start again').click()
  }
}

export default new CheckBeforeCreatingPRNPage()
