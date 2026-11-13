import { AdminPage } from 'page-objects/admin/page'

class WasteRecordsExportPage extends AdminPage {
  open() {
    return super.open('/waste-records-export')
  }

  async fetchCsv() {
    return super.fetchCsv('/waste-records-export')
  }

  /** @returns {import('@playwright/test').Locator} */
  yearDropdown() {
    return this.page.getByLabel('Year', { exact: true })
  }

  /** @returns {Promise<string[]>} */
  async availableYears() {
    return this.yearDropdown().locator('option').allInnerTexts()
  }

  /** @returns {import('@playwright/test').Locator} */
  downloadCsvButton() {
    return this.page.getByRole('button', { name: 'Download CSV', exact: true })
  }
}

export { WasteRecordsExportPage }
