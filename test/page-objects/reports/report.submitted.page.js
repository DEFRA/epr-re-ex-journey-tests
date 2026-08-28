class ReportSubmittedPage {
  constructor(page) {
    this.page = page
  }

  async confirmationText() {
    return this.page.locator('.govuk-panel--confirmation h1').innerText()
  }

  viewReportLink() {
    return this.page.getByRole('button', {
      name: 'View report (Opens in a new tab)',
      exact: true
    })
  }

  returnToReportsLink() {
    return this.page.getByRole('link', {
      name: 'Return to your reports',
      exact: true
    })
  }
}

export { ReportSubmittedPage }
