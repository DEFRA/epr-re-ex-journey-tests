import { AdminPage } from 'page-objects/admin/page'

class TonnageMonitoringPage extends AdminPage {
  open() {
    return super.open('/tonnage-monitoring')
  }

  async downloadCsv() {
    return this.page
      .locator('#main-content > div > div > div > form > button')
      .click()
  }

  async tonnageMaterialTableData() {
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
