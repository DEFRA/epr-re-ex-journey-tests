import { Page } from 'page-objects/page'

class ReportStaleErrorPage extends Page {
  async returnToReports() {
    await this.page.locator('a', { hasText: 'Return to reports' }).click()
  }

  async deleteAndStartAgain() {
    await this.clickButton('Delete and start again')
  }
}

export { ReportStaleErrorPage }
