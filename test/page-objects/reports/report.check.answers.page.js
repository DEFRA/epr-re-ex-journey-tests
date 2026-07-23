import { Page } from 'page-objects/page'
import { checkDoubleClickPrevented } from '../../support/double-click.js'

class ReportCheckAnswersPage extends Page {
  async createReport() {
    await this.page.locator('button[type=submit]').click()
  }

  async createReportAndCheckDoubleClickPrevented() {
    await checkDoubleClickPrevented(this.page, 'button[type=submit]')
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
