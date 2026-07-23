import { AdminPage } from 'page-objects/admin/page'

class ORSOverviewPage extends AdminPage {
  async getORSTableData() {
    const rows = this.page.locator('table.govuk-table tbody tr')
    const count = await rows.count()
    const data = []

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i)
      data.push({
        orsId: await row.locator('td:nth-child(1)').innerText(),
        packagingWasteCategory: await row
          .locator('td:nth-child(2)')
          .innerText(),
        destinationCountry: await row.locator('td:nth-child(3)').innerText(),
        overseasReprocessorName: await row
          .locator('td:nth-child(4)')
          .innerText(),
        addressLine1: await row.locator('td:nth-child(5)').innerText(),
        addressLine2: await row.locator('td:nth-child(6)').innerText(),
        cityOrTown: await row.locator('td:nth-child(7)').innerText(),
        stateProvinceOrRegion: await row.locator('td:nth-child(8)').innerText(),
        postcode: await row.locator('td:nth-child(9)').innerText(),
        coordinates: await row.locator('td:nth-child(10)').innerText(),
        validFrom: await row.locator('td:nth-child(11)').innerText()
      })
    }

    return data
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
