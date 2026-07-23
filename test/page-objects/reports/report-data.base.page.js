import { Page } from 'page-objects/page'

export class ReportDataBasePage extends Page {
  async continue() {
    await this.page.locator('button[value="continue"]').click()
  }

  async saveAndComeBackLater() {
    await this.page.locator('button[value="save"]').click()
  }

  async deleteReportLink() {
    await this.page.locator('a', { hasText: 'Delete report' }).click()
  }

  async enterRevenue(value) {
    await this.page.locator('#prnRevenue').fill(value)
  }
}
