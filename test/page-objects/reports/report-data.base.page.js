import { Page } from 'page-objects/page'

export class ReportDataBasePage extends Page {
  async continue() {
    await this.page.locator('button[value="continue"]').click()
  }

  async saveAndComeBackLater() {
    await this.page.locator('button[value="save"]').click()
  }

  deleteReportLink() {
    return this.page.getByRole('link', { name: 'Delete report', exact: true })
  }

  async enterRevenue(value) {
    await this.page.locator('#prnRevenue').fill(value)
  }
}
