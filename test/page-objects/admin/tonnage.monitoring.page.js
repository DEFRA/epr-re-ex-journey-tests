import { AdminPage } from 'page-objects/admin/page'

class TonnageMonitoringPage extends AdminPage {
  open() {
    return super.open('/tonnage-monitoring')
  }

  /** @param {number} year */
  openYear(year) {
    return super.open(`/tonnage-monitoring?year=${year}`)
  }

  /**
   * The total the table shows for a material and operator type.
   *
   * @param {{ material: string, type: string }} row
   * @returns {Promise<string>}
   */
  async totalFor({ material, type }) {
    const tableData = await this.tonnageMaterialTableData()
    const row = tableData.find(
      (candidate) => candidate.Material === material && candidate.Type === type
    )
    if (!row) {
      throw new Error(`No ${type} row for ${material}`)
    }
    return row.Total
  }

  downloadCsvButton() {
    return this.page.getByRole('button', { name: 'Download CSV', exact: true })
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

  async tonnageMaterialTableData() {
    // .count() below reads the DOM as-is with no auto-wait (unlike actions
    // such as .click()), so without this the table can be read before it's
    // rendered - seen as an intermittent 0-row result in CI.
    await this.page
      .locator('table.govuk-table')
      .waitFor({ state: 'visible', timeout: 10000 })

    const headerElements = this.page.locator('table.govuk-table thead th')
    const headerCount = await headerElements.count()
    const headers = []
    for (let i = 0; i < headerCount; i++) {
      headers.push(await headerElements.nth(i).innerText())
    }

    const rows = this.page.locator('table.govuk-table tbody tr')
    const rowCount = await rows.count()
    const tableData = []

    for (let i = 0; i < rowCount; i++) {
      const cells = rows.nth(i).locator('th, td')
      const rowData = {}

      for (let j = 0; j < headers.length; j++) {
        const cellText = await cells.nth(j).innerText()
        rowData[headers[j]] = cellText.trim()
      }

      tableData.push(rowData)
    }

    return tableData
  }
}

export { TonnageMonitoringPage }
