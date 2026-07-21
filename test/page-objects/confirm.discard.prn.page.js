import { $ } from '@wdio/globals'
import { Page } from 'page-objects/page'
import { checkDoubleClickPrevented } from '../support/double-click.js'

class ConfirmDiscardPRNPage extends Page {
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
}

export default new ConfirmDiscardPRNPage()
