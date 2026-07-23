class ConfirmationPage {
  constructor(page) {
    this.page = page
  }

  async goToReports() {
    await this.page.getByRole('link', { name: 'Go to reports' }).click()
  }

  async viewDraftReport() {
    await this.page.getByRole('link', { name: 'View draft report' }).click()
  }
}

export { ConfirmationPage }
