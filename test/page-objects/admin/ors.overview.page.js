import { AdminPage } from 'page-objects/admin/page'
import { $, $$ } from '@wdio/globals'

class ORSOverviewPage extends AdminPage {
  async getHeaderText() {
    const heading = $('#main-content h1.govuk-heading-xl')
    await heading.waitForExist()
    return heading.getText()
  }

  async getORSTableData() {
    return await $$('table.govuk-table tbody tr').map(async (row) => {
      const orsId = await row.$('td:nth-child(1)')
      const packagingWasteCategory = await row.$('td:nth-child(2)')
      const destinationCountry = await row.$('td:nth-child(3)')
      const overseasReprocessorName = await row.$('td:nth-child(4)')
      const addressLine1 = await row.$('td:nth-child(5)')
      const addressLine2 = await row.$('td:nth-child(6)')
      const cityOrTown = await row.$('td:nth-child(7)')
      const stateProvinceOrRegion = await row.$('td:nth-child(8)')
      const postcode = await row.$('td:nth-child(9)')
      const coordinates = await row.$('td:nth-child(10)')
      const validFrom = await row.$('td:nth-child(11)')
      return {
        orsId: await orsId.getText(),
        packagingWasteCategory: await packagingWasteCategory.getText(),
        destinationCountry: await destinationCountry.getText(),
        overseasReprocessorName: await overseasReprocessorName.getText(),
        addressLine1: await addressLine1.getText(),
        addressLine2: await addressLine2.getText(),
        cityOrTown: await cityOrTown.getText(),
        stateProvinceOrRegion: await stateProvinceOrRegion.getText(),
        postcode: await postcode.getText(),
        coordinates: await coordinates.getText(),
        validFrom: await validFrom.getText()
      }
    })
  }

  async clickOnBreadcrumbLink(position) {
    await $(
      `body > div.govuk-width-container > nav.govuk-breadcrumbs > ol > li:nth-child(${position}) > a`
    ).click()
  }
}

export default new ORSOverviewPage()
