import { $ } from '@wdio/globals'
import { checkDoubleClickPrevented } from '../support/double-click.js'

class ConfirmDeleteReportPage {
  async headingText() {
    const element = await $('h1.govuk-heading-xl')
    await element.waitForExist({ timeout: 5000 })
    return await element.getText()
  }

  async warningText() {
    const element = await $('p*=cannot be undone')
    await element.waitForExist({ timeout: 5000 })
    return await element.getText()
  }

  async confirmDeletion() {
    await $('button[type=submit]').click()
  }

  async confirmDeletionAndCheckDoubleClickPrevented() {
    await checkDoubleClickPrevented('button[type=submit]')
  }

  async selectBackLink() {
    await $('a*=Back').click()
  }
}

export default new ConfirmDeleteReportPage()
