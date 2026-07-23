import { AdminPage } from 'page-objects/admin/page'

class UnlinkOrganisationConfirmationPage extends AdminPage {
  async getBodyText() {
    return this.page.locator('#main-content p.govuk-body').innerText()
  }

  async getWarningText() {
    return this.page
      .locator('#main-content .govuk-warning-text__text')
      .innerText()
  }

  async confirmUnlink() {
    await this.page.locator('#main-content form button').click()
  }

  async cancel() {
    await this.page.locator('a', { hasText: 'Cancel' }).click()
  }
}

export { UnlinkOrganisationConfirmationPage }
