import { Page } from 'page-objects/page'

const SUBMIT_SELECTOR = '#main-content button[type=submit]'

class MonthlyReportDraftDeclarationPage extends Page {
  async statusTag() {
    return this.page.locator('#main-content .govuk-tag').innerText()
  }

  async enterFullName(name) {
    await this.page.locator('#submissionDeclaredBy').fill(name)
  }

  async continue() {
    await this.submit(SUBMIT_SELECTOR)
  }

  async confirmAndSubmit(name = 'Test User') {
    await this.enterFullName(name)
    await this.continue()
  }

  async submitAndCheckDoubleClickPrevented(name = 'Test User') {
    await this.enterFullName(name)
    await super.submitAndCheckDoubleClickPrevented(SUBMIT_SELECTOR)
  }

  async deleteReport() {
    await this.page.locator('a', { hasText: 'Delete report' }).click()
  }
}

export { MonthlyReportDraftDeclarationPage }
