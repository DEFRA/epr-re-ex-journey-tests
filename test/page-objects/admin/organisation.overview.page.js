import { AdminPage } from 'page-objects/admin/page'
import { $, $$ } from '@wdio/globals'

class OrganisationOverviewPage extends AdminPage {
  async getHeaderText() {
    const heading = $('#main-content h1.govuk-heading-xl')
    await heading.waitForExist()
    return heading.getText()
  }

  async getRegistrationsTableData() {
    return await $$('table.govuk-table tbody tr').map(async (row) => {
      const registrationNumber = await row.$('td:nth-child(1)')
      const registrationStatus = await row.$('td:nth-child(2)')
      const processingType = await row.$('td:nth-child(3)')
      const material = await row.$('td:nth-child(4)')
      const site = await row.$('td:nth-child(5)')
      const accreditationNumber = await row.$('td:nth-child(6)')
      const accreditationStatus = await row.$('td:nth-child(7)')
      return {
        registrationNumber: await registrationNumber.getText(),
        registrationStatus: await registrationStatus.getText(),
        processingType: await processingType.getText(),
        material: await material.getText(),
        site: await site.getText(),
        accreditationNumber: await accreditationNumber.getText(),
        accreditationStatus: await accreditationStatus.getText()
      }
    })
  }

  async viewRegistrationLink(row) {
    await $(
      `main table tbody tr:nth-child(${row}) td:nth-child(8) a:nth-of-type(1)`
    ).click()
  }

  async getDefraIdLinkText() {
    const summary = $('#main-content .govuk-summary-list')
    await summary.waitForExist()
    return summary.getText()
  }

  async isUnlinkButtonDisplayed() {
    return $('a*=Unlink organisation').isExisting()
  }

  async clickUnlink() {
    await $('a*=Unlink organisation').click()
  }

  async getNoLinkedOrganisationText() {
    return $('p*=No linked organisation').getText()
  }

  async getNotificationBannerText() {
    const banner = $('.govuk-notification-banner')
    await banner.waitForExist()
    return banner.getText()
  }
}

export default new OrganisationOverviewPage()
