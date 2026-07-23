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
    await this.page.getByRole('link', { name: 'View report' }).click()
  }

  async returnToReportsLink() {
    await this.page
      .getByRole('link', { name: 'Return to your reports' })
      .click()
  }
}

export { ReportSubmittedPage }
