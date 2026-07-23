class ConfirmationPage {
  constructor(page) {
    this.page = page
  }

  async goToReports() {
    await this.page.locator('a', { hasText: 'Go to reports' }).click()
  }

  async viewDraftReport() {
    await this.page.locator('a', { hasText: 'View draft report' }).click()
  }
}

export { ConfirmationPage }
