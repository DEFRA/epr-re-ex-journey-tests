import { $ } from '@wdio/globals'

class ReportSubmittedPage {
  async confirmationText() {
    const element = await $(
      '#main-content > div > div > div.govuk-panel.govuk-panel--confirmation > h1'
    )
    await element.waitForExist({ timeout: 5000 })
    return await element.getText()
  }

  async viewReportLink() {
    await $('a*=View report').click()
  }

  async returnToReportsLink() {
    await $('a*=Return to your reports').click()
  }
}

export default new ReportSubmittedPage()
