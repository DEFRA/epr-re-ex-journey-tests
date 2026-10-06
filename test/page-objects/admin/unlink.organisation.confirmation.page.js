import { expect } from '@playwright/test'
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

  async cancel() {
    await this.page.getByRole('link', { name: 'Cancel', exact: true }).click()
    // Wait for the confirm page to go: callers query the organisation
    // overview immediately with non-waiting locators (e.g. count()), which
    // otherwise race the page load and flake.
    await expect(this.confirmUnlinkButton()).toBeHidden()
  }
}

export { UnlinkOrganisationConfirmationPage }
