import { AdminPage } from 'page-objects/admin/page'

class OrganisationOverviewPage extends AdminPage {
  async getRegistrationsTableData() {
    const rows = this.page.locator('table.govuk-table tbody tr')
    const count = await rows.count()
    const data = []

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i)
      data.push({
        registrationNumber: await row.locator('td:nth-child(1)').innerText(),
        registrationStatus: await row.locator('td:nth-child(2)').innerText(),
        processingType: await row.locator('td:nth-child(3)').innerText(),
        material: await row.locator('td:nth-child(4)').innerText(),
        site: await row.locator('td:nth-child(5)').innerText(),
        accreditationNumber: await row.locator('td:nth-child(6)').innerText(),
        accreditationStatus: await row.locator('td:nth-child(7)').innerText()
      })
    }

    return data
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
