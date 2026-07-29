import { AdminPage } from 'page-objects/admin/page'

class WasteBalanceAvailabilityPage extends AdminPage {
  open() {
    return super.open('/waste-balance-availability')
  }

  async fetchCsv() {
    return super.fetchCsv('/waste-balance-availability')
  }

  async materialTableData() {
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
        rowData[headers[j]] = (await cells.nth(j).innerText()).trim()
      }
      tableData.push(rowData)
    }

    return tableData
  }
}

export { WasteBalanceAvailabilityPage }
