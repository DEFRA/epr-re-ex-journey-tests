import { $ } from '@wdio/globals'

export class ReportDataBasePage {
  async headingText() {
    const element = await $('h1.govuk-heading-xl')
    await element.waitForExist({ timeout: 5000 })
    return await element.getText()
  }

  async continue() {
    await $('button[value="continue"]').click()
  }

  async saveAndComeBackLater() {
    await $('button[value="save"]').click()
  }

  async deleteReportLink() {
    await $('a*=Delete report').click()
  }

  async selectBackLink() {
    await $('a*=Back').click()
  }
}
