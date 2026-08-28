import { Page } from 'page-objects/page'

class ConfirmDeleteReportPage extends Page {
  async warningText() {
    return this.page.locator('p', { hasText: 'cannot be undone' }).innerText()
  }

  async confirmDeletion() {
    await this.clickButton('Confirm deletion')
  }

  async confirmDeletionAndCheckDoubleClickPrevented() {
    await this.clickButtonCheckingDoubleClickPrevented('Confirm deletion')
  }
}

export { ConfirmDeleteReportPage }
