import { $ } from '@wdio/globals'
import { checkDoubleClickPrevented } from '../../support/double-click.js'

class ReportCheckAnswersPage {
  async headingText() {
    const element = await $('h1.govuk-heading-xl')
    await element.waitForExist({ timeout: 5000 })
    return await element.getText()
  }

  async createReport() {
    await $('button[type=submit]').click()
  }

  async createReportAndCheckDoubleClickPrevented() {
    await checkDoubleClickPrevented('button[type=submit]')
  }

  async deleteAndStartAgainLink() {
    await $('a.govuk-button--warning=Delete and start again').click()
  }
}

export default new ReportCheckAnswersPage()
