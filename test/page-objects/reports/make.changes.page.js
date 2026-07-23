import { Page } from 'page-objects/page'
import { checkDoubleClickPrevented } from '../../support/double-click.js'

class MakeChangesPage extends Page {
  async useThisReportsSummaryLog() {
    await this.page
      .getByRole('button', {
        name: "Use this report's summary log",
        exact: true
      })
      .click()
  }

  async useThisReportsSummaryLogAndCheckDoubleClickPrevented() {
    await checkDoubleClickPrevented(
      this.page,
      `button:text-is("Use this report's summary log")`
    )
  }

  async uploadNewSummaryLog() {
    await this.page
      .locator('a.govuk-button--secondary', {
        hasText: 'Upload new summary log'
      })
      .click()
  }

  async cancel() {
    await this.page.locator('a', { hasText: /^Cancel$/ }).click()
  }
}

export { MakeChangesPage }
