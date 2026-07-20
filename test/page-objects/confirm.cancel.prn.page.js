import { $ } from '@wdio/globals'
import { checkDoubleClickPrevented } from '../support/double-click.js'

class ConfirmCancelPRNPage {
  async headingText() {
    const element = await $('h1.govuk-heading-xl')
    await element.waitForExist({ timeout: 5000 })
    return await element.getText()
  }

  async confirmCancelAndCheckDoubleClickPrevented() {
    await checkDoubleClickPrevented('button[type=submit]')
  }

  async confirmCancelPrn() {
    await $('button[type=submit]').click()
  }

  async selectBackLink() {
    await $('a*=Back').click()
  }
}

export default new ConfirmCancelPRNPage()
