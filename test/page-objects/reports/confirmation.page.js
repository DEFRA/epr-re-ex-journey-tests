class ConfirmationPage {
  constructor(page) {
    this.page = page
  }

  goToReports() {
    return this.page.getByRole('link', { name: 'Go to reports', exact: true })
  }

  viewDraftReport() {
    return this.page.getByRole('link', {
      name: 'View draft report (opens in new tab)',
      exact: true
    })
  }
}

export { ConfirmationPage }
