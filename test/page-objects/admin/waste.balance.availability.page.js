import { AdminPage } from 'page-objects/admin/page'

class WasteBalanceAvailabilityPage extends AdminPage {
  open() {
    return super.open('/waste-balance-availability')
  }

  /** @returns {import('@playwright/test').Locator} */
  yearDropdown() {
    return this.page.getByLabel('Year', { exact: true })
  }

  /** @returns {Promise<string[]>} */
  async availableYears() {
    return this.yearDropdown().locator('option').allInnerTexts()
  }

  /** @param {string} year */
  async showYear(year) {
    await this.yearDropdown().selectOption(year)
    await this.page
      .getByRole('button', { name: 'Show year', exact: true })
      .click()
  }

  /** @returns {import('@playwright/test').Locator} */
  balanceTable() {
    return this.page.getByRole('table', {
      name: 'Available balance by material'
    })
  }

  /** @returns {import('@playwright/test').Locator} */
  downloadCsvButton() {
    return this.page.getByRole('button', { name: 'Download CSV', exact: true })
  }
}

export { WasteBalanceAvailabilityPage }
