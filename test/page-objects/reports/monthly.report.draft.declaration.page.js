import { $ } from '@wdio/globals'
import { checkDoubleClickPrevented } from '../../support/double-click.js'

class MonthlyReportDraftDeclarationPage {
  async headingText() {
    const element = await $('h1.govuk-heading-xl')
    await element.waitForExist({ timeout: 5000 })
    return await element.getText()
  }

  async statusTag() {
    const element = await $('#main-content .govuk-tag')
    await element.waitForExist({ timeout: 5000 })
    return await element.getText()
  }

  async enterFullName(name) {
    await $('#submissionDeclaredBy').setValue(name)
  }

  async confirmAndSubmit(name = 'Test User') {
    await this.enterFullName(name)
    const buttonElement = await $('#main-content button[type=submit]')
    await buttonElement.waitForClickable({ timeout: 5000 })
    await buttonElement.click()
  }

  async submitAndCheckDoubleClickPrevented(name = 'Test User') {
    await this.enterFullName(name)
    await checkDoubleClickPrevented('#main-content button[type=submit]')
  }

  async deleteReport() {
    await $('a*=Delete report').click()
  }
}

export default new MonthlyReportDraftDeclarationPage()
