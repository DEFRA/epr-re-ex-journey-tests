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
    // Wait for the navigation back to the organisation overview: callers
    // query that page immediately with non-waiting locators (e.g. count()),
    // which otherwise race the page load and flake.
    await this.page.waitForURL(/\/organisations\/[^/]+\/overview$/)
  }
}

export { UnlinkOrganisationConfirmationPage }
