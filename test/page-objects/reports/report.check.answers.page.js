import { Page } from 'page-objects/page'

class ReportCheckAnswersPage extends Page {
  async createReport() {
    await this.submit()
  }

  async createReportAndCheckDoubleClickPrevented() {
    await this.submitAndCheckDoubleClickPrevented()
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
