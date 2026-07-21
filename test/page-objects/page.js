import { browser, $, $$ } from '@wdio/globals'

class Page {
  open(path) {
    return browser.url(path)
  }

  async headingText() {
    const element = await $('h1.govuk-heading-xl')
    await element.waitForExist({ timeout: 5000 })
    return await element.getText()
  }

  async selectBackLink() {
    await $('a*=Back').click()
  }

  async messageText() {
    const bodyElement = await $('#main-content > div > div > div')
    await bodyElement.waitForExist({ timeout: 5000 })
    return await bodyElement.getText()
  }

  async dashboardHeaderText() {
    return $('#main-content > div > div > div > h1').getText()
  }

  async wasteBalanceAmount() {
    const element = await $('[data-testid="waste-balance-amount"]')
    await element.waitForExist({ timeout: 5000 })
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

  async signOut() {
    await $('a*=Sign out').click()
  }
}

export { Page }
