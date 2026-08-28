import { Page } from 'page-objects/page'

class ReportCheckAnswersPage extends Page {
  async createReport() {
    await this.clickButton('Create draft report')
  }

  async createReportAndCheckDoubleClickPrevented() {
    await this.clickButtonCheckingDoubleClickPrevented('Create draft report')
  }

  async deleteAndStartAgainLink() {
    await this.page
      .locator('a.govuk-button--warning', {
        hasText: 'Delete and start again'
      })
      .click()
  }
}

export { ReportCheckAnswersPage }
