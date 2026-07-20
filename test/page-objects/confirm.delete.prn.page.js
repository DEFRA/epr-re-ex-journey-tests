import { $ } from '@wdio/globals'
import { checkDoubleClickPrevented } from '../support/double-click.js'

class ConfirmDeletePRNPage {
  async headingText() {
    const element = await $('h1.govuk-heading-xl')
    await element.waitForExist({ timeout: 5000 })
    return await element.getText()
  }

  async deletePrnAndCheckDoubleClickPrevented() {
    await checkDoubleClickPrevented('button[type=submit]')
  }

  async deletePrn() {
    await $('button[type=submit]').click()
  }

  async selectBackLink() {
    await $('a*=Back').click()
  }
}

export default new ConfirmDeletePRNPage()
