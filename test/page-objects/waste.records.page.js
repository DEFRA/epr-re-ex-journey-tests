import { browser, $ } from '@wdio/globals'

class WasteRecordsPage {
  open(orgId, regId) {
    return browser.url(`/organisations/${orgId}/registrations/${regId}`)
  }

  async dashboardHeaderText() {
    return $('#main-content > div > div > div > h1').getText()
  }

  async submitSummaryLogLink() {
    await $('a*=Upload your summary log').click()
  }

  async createNewPRNLink() {
    await $('a*=Create new PRN').click()
  }

  async managePRNsLink() {
    await $('a*=Manage PRNs').click()
  }

  async managePERNsLink() {
    await $('a*=Manage PERNs').click()
  }

  async createNewPERNLink() {
    await $('a*=Create new PERN').click()
  }

  async manageReportsLink() {
    await $('a*=Manage reports').click()
  }

  async selectBackLink() {
    await $('a*=Back').click()
  }

  async wasteBalanceAmount() {
    const element = await $('[data-testid="waste-balance-amount"]')
    await element.waitForExist({ timeout: 5000 })
    return await element.getText()
  }
}

export default new WasteRecordsPage()
