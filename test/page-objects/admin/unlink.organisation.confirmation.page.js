import { AdminPage } from 'page-objects/admin/page'

class UnlinkOrganisationConfirmationPage extends AdminPage {
  async getBodyText() {
    return this.page.locator('#main-content p.govuk-body').first().innerText()
  }

  async getWarningText() {
    return this.page
      .locator('#main-content .govuk-warning-text__text')
      .innerText()
  }

  confirmUnlinkButton() {
    return this.page.locator('#main-content form button')
  }
}

export { UnlinkOrganisationConfirmationPage }
