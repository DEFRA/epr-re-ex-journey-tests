import { AdminPage } from 'page-objects/admin/page'

class RegistrationOverviewPage extends AdminPage {
  async getYearsTableData() {
    // readGovukTableRows counts rows with no auto-wait, so wait for the table
    // first.
    await this.page
      .locator('#years table')
      .waitFor({ state: 'visible', timeout: 10000 })

    return this.readGovukTableRows('#years table', {
      year: 1,
      accreditationStatus: 2,
      accreditationNumber: 3
    })
  }

  // The View link's accessible name carries the year in visually hidden text.
  async viewYear(year) {
    await this.page
      .locator('#years')
      .getByRole('link', { name: `View ${year}`, exact: true })
      .click()
  }
}

export { RegistrationOverviewPage }
