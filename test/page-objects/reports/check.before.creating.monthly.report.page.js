import { $, $$ } from '@wdio/globals'

class CheckBeforeCreatingMonthlyReportPage {
  async toDataMap(summaryRows) {
    const dataMap = {}
    for (const row of summaryRows) {
      const key = await row.$('.govuk-summary-list__key').getText()
      const value = await row.$('.govuk-summary-list__value').getText()
      dataMap[key] = value
    }
    return dataMap
  }

  async reportDetails() {
    const summaryRows = await $$(
      'dl.govuk-summary-list > div.govuk-summary-list__row'
    )
    return await this.toDataMap(summaryRows)
  }

  async changeTotalTonnagePackagingWasteRecycled() {
    await $('a*=Total tonnage of packaging waste recycled').click()
  }

  async changeTotalTonnagePackagingWasteReceivedNotRecycled() {
    await $(
      'a*=Total tonnage of packaging waste received but not recycled'
    ).click()
  }

  async changeTotalTonnageForPrnsIssued() {
    await $('a*=Total tonnage for PRNs issued').click()
  }

  async changeTotalRevenueOfPrns() {
    await $('a*=Total revenue of PRNs').click()
  }

  async changeTotalTonnageOfPrnsIssuedForFree() {
    await $('a*=Total tonnage of PRNs issued for free').click()
  }

  async changeSupportingInformationForYourRegulator() {
    await $('a*=Supporting information for your regulator').click()
  }

  async createDraftReport() {
    await $('#main-content button[type=submit]').click()
  }

  async cancelAndStartAgain() {
    await $('a*=Cancel and start again').click()
  }
}

export default new CheckBeforeCreatingMonthlyReportPage()
