import { Page } from 'page-objects/page'
import { checkDoubleClickPrevented } from '../support/double-click.js'

class ConfirmDeletePRNPage extends Page {
  async deletePrnAndCheckDoubleClickPrevented() {
    await checkDoubleClickPrevented(this.page, 'button[type=submit]')
  }

  async deletePrn() {
    await this.page.locator('button[type=submit]').click()
  }
}

export { ConfirmDeletePRNPage }
