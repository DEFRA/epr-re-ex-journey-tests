import { AdminPage } from 'page-objects/admin/page'

class OrganisationOverviewPage extends AdminPage {
  async getRegistrationsTableData() {
    return this.readGovukTableRows('table.govuk-table', {
      registrationNumber: 1,
      registrationStatus: 2,
      processingType: 3,
      material: 4,
      site: 5,
      accreditationNumber: 6,
      accreditationStatus: 7
    })
  }

  async viewRegistrationLink(row) {
    await this.page
      .locator(
        `main table tbody tr:nth-child(${row}) td:nth-child(8) a:nth-of-type(1)`
      )
      .click()
  }

  async getDefraIdLinkText() {
    return this.page.locator('#main-content .govuk-summary-list').innerText()
  }

  async isUnlinkButtonDisplayed() {
    return (
      (await this.page
        .locator('a', { hasText: 'Unlink organisation' })
        .count()) > 0
    )
  }

  async clickUnlink() {
    await this.page.locator('a', { hasText: 'Unlink organisation' }).click()
  }

  async getNoLinkedOrganisationText() {
    return this.page
      .locator('p', { hasText: 'No linked organisation' })
      .innerText()
  }

  async getNotificationBannerText() {
    return this.page.locator('.govuk-notification-banner').innerText()
  }
}

export { OrganisationOverviewPage }
