import { AdminPage } from 'page-objects/admin/page'

class UnsubmitConfirmationPage extends AdminPage {
  async getWarningText() {
    return this.page.locator('.govuk-warning-text__text').innerText()
  }

  async getDetailsText() {
    return this.page.locator('#main-content').innerText()
  }

  confirmUnsubmitButton() {
    return this.page.getByRole('button', {
      name: 'Yes, unsubmit this report',
      exact: true
    })
  }

  async getSuccessMessage() {
    return this.page.locator('.govuk-panel__title').innerText()
  }

  returnToRegistrationOverviewLink() {
    return this.page.locator('a', {
      hasText: /^\s*Back to registration overview\s*$/
    })
  }
}

export { UnsubmitConfirmationPage }
