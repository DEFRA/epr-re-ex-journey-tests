class ReportSubmittedPage {
  constructor(page) {
    this.page = page
  }

  async confirmationText() {
    return this.page
      .locator(
        '#main-content > div > div > div.govuk-panel.govuk-panel--confirmation > h1'
      )
      .innerText()
  }

  async viewReportLink() {
    await this.page.locator('a', { hasText: 'View report' }).click()
  }

  async returnToReportsLink() {
    await this.page.locator('a', { hasText: 'Return to your reports' }).click()
  }
}

export { ReportSubmittedPage }
