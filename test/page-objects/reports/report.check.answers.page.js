import { Page } from 'page-objects/page'

class ReportCheckAnswersPage extends Page {
  async createReport() {
    await this.clickButton('Create draft report')
  }

  async createReportAndCheckDoubleClickPrevented() {
    await this.clickButtonCheckingDoubleClickPrevented('Create draft report')
  }

  deleteAndStartAgainLink() {
    return this.page.locator('a.govuk-button--warning', {
      hasText: 'Delete and start again'
    })
  }
}

export { ReportCheckAnswersPage }
