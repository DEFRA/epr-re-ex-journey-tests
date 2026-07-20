import { $ } from '@wdio/globals'

class ReportStaleErrorPage {
  async headingText() {
    const element = await $('h1.govuk-heading-xl')
    await element.waitForExist({ timeout: 5000 })
    return await element.getText()
  }

  async returnToReports() {
    await $('a*=Return to reports').click()
  }

  async deleteAndStartAgain() {
    await $('button[type=submit]').click()
  }
}

export default new ReportStaleErrorPage()
