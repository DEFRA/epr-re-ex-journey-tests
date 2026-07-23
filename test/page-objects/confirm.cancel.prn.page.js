import { Page } from 'page-objects/page'
import { checkDoubleClickPrevented } from '../support/double-click.js'

class ConfirmCancelPRNPage extends Page {
  async confirmCancelAndCheckDoubleClickPrevented() {
    await checkDoubleClickPrevented(this.page, 'button[type=submit]')
  }

  async confirmCancelPrn() {
    await this.page.locator('button[type=submit]').click()
  }
}

export { ConfirmCancelPRNPage }
