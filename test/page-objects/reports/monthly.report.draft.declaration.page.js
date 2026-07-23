import { Page } from 'page-objects/page'
import { checkDoubleClickPrevented } from '../../support/double-click.js'

class MonthlyReportDraftDeclarationPage extends Page {
  async statusTag() {
    return this.page.locator('#main-content .govuk-tag').innerText()
  }

  async enterFullName(name) {
    await this.page.locator('#submissionDeclaredBy').fill(name)
  }

  async confirmAndSubmit(name = 'Test User') {
    await this.enterFullName(name)
    await this.page.locator('#main-content button[type=submit]').click()
  }

  async submitAndCheckDoubleClickPrevented(name = 'Test User') {
    await this.enterFullName(name)
    await checkDoubleClickPrevented(
      this.page,
      '#main-content button[type=submit]'
    )
  }

  async deleteReport() {
    await this.page.getByRole('link', { name: 'Delete report' }).click()
  }
}

export { MonthlyReportDraftDeclarationPage }
