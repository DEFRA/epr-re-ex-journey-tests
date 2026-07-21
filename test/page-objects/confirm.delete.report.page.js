import { $ } from '@wdio/globals'
import { Page } from 'page-objects/page'
import { checkDoubleClickPrevented } from '../support/double-click.js'

class ConfirmDeleteReportPage extends Page {
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
}

export default new ConfirmDeleteReportPage()
