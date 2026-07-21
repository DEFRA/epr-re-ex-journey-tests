import { $ } from '@wdio/globals'
import { Page } from 'page-objects/page'
import { checkDoubleClickPrevented } from '../support/double-click.js'

class ConfirmDeletePRNPage extends Page {
  async deletePrnAndCheckDoubleClickPrevented() {
    await checkDoubleClickPrevented('button[type=submit]')
  }

  async deletePrn() {
    await $('button[type=submit]').click()
  }
}

export default new ConfirmDeletePRNPage()
