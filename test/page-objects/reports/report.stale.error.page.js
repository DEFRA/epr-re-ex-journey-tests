import { Page } from 'page-objects/page'

class ReportStaleErrorPage extends Page {
  async returnToReports() {
    await this.page.getByRole('link', { name: 'Return to reports' }).click()
  }

  async deleteAndStartAgain() {
    await this.page.locator('button[type=submit]').click()
  }
}

export { ReportStaleErrorPage }
