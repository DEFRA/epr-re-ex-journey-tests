import { Page } from 'page-objects/page'

class ConfirmDeleteReportPage extends Page {
  async warningText() {
    return this.page
      .getByText(
        'Confirm that you want to delete this report. This action cannot be undone.',
        { exact: true }
      )
      .innerText()
  }

  async confirmDeletion() {
    await this.clickButton('Confirm deletion')
  }

  async confirmDeletionAndCheckDoubleClickPrevented() {
    await this.clickButtonCheckingDoubleClickPrevented('Confirm deletion')
  }
}

export { ConfirmDeleteReportPage }
