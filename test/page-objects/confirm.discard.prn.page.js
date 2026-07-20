import { $ } from '@wdio/globals'
import { checkDoubleClickPrevented } from '../support/double-click.js'

class ConfirmDiscardPRNPage {
  async headingText() {
    const element = await $('h1.govuk-heading-xl')
    await element.waitForExist({ timeout: 10000 })
    return await element.getText()
  }

  async discardAndCheckDoubleClickPrevented() {
    await checkDoubleClickPrevented('button[type=submit]')
  }

  async discardAndStartAgain() {
    await $('button[type=submit]').click()
  }

  async selectBackLink() {
    await $('a*=Back').click()
  }
}

export default new ConfirmDiscardPRNPage()
