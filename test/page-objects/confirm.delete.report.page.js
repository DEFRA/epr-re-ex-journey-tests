import { Page } from 'page-objects/page'
import { checkDoubleClickPrevented } from '../support/double-click.js'

class ConfirmDeleteReportPage extends Page {
  async warningText() {
    return this.page.locator('p', { hasText: 'cannot be undone' }).innerText()
  }

  async confirmDeletion() {
    await this.page.locator('button[type=submit]').click()
  }

  async confirmDeletionAndCheckDoubleClickPrevented() {
    await checkDoubleClickPrevented(this.page, 'button[type=submit]')
  }
}

export { ConfirmDeleteReportPage }
