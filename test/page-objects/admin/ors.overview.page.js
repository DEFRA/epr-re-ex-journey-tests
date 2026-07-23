import { AdminPage } from 'page-objects/admin/page'

class ORSOverviewPage extends AdminPage {
  async getORSTableData() {
    return this.readGovukTableRows('table.govuk-table', {
      orsId: 1,
      packagingWasteCategory: 2,
      destinationCountry: 3,
      overseasReprocessorName: 4,
      addressLine1: 5,
      addressLine2: 6,
      cityOrTown: 7,
      stateProvinceOrRegion: 8,
      postcode: 9,
      coordinates: 10,
      validFrom: 11
    })
  }

  async clickOnBreadcrumbLink(position) {
    await this.page
      .locator(
        `body > div.govuk-width-container > nav.govuk-breadcrumbs > ol > li:nth-child(${position}) > a`
      )
      .click()
  }
}

export { ORSOverviewPage }
