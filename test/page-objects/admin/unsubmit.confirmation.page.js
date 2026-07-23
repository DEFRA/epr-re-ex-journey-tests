import { AdminPage } from 'page-objects/admin/page'

class UnsubmitConfirmationPage extends AdminPage {
  async getWarningText() {
    return this.page.locator('.govuk-warning-text__text').innerText()
  }

  async getDetailsText() {
    return this.page.locator('#main-content').innerText()
  }

  async confirmUnsubmit() {
    await this.page
      .getByRole('button', { name: 'Yes, unsubmit this report', exact: true })
      .click()
  }

  async getSuccessMessage() {
    return this.page.locator('.govuk-panel__title').innerText()
  }

  async returnToRegistrationOverview() {
    await this.page
      .getByRole('link', {
        name: 'Back to registration overview',
        exact: true
      })
      .click()
  }
}

export { UnsubmitConfirmationPage }
