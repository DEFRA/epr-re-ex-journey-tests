import { AdminPage } from 'page-objects/admin/page'

class SummaryLogUploadsPage extends AdminPage {
  open() {
    return super.open('/summary-log')
  }

  async totalRowsText() {
    return this.page.locator('p', { hasText: 'Total rows:' }).innerText()
  }

  tableText() {
    return this.page.locator('table.govuk-table').innerText()
  }

  pageBodyText() {
    return this.page.locator('[data-testid="app-page-body"]').innerText()
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
  downloadCsvButton() {
    return this.page.getByRole('button', { name: 'Download CSV', exact: true })
  }
}

export { SummaryLogUploadsPage }
