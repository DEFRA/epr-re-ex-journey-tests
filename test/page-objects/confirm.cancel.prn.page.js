import { $ } from '@wdio/globals'
import { Page } from 'page-objects/page'
import { checkDoubleClickPrevented } from '../support/double-click.js'

class ConfirmCancelPRNPage extends Page {
  async confirmCancelAndCheckDoubleClickPrevented() {
    await checkDoubleClickPrevented('button[type=submit]')
  }

  async confirmCancelPrn() {
    await $('button[type=submit]').click()
  }
}

export default new ConfirmCancelPRNPage()
