import { AdminPage } from 'page-objects/admin/page'
import { $, $$ } from '@wdio/globals'

class TonnageMonitoringPage extends AdminPage {
  open() {
    return super.open('/tonnage-monitoring')
  }

  async downloadCsv() {
    return await $('#main-content > div > div > div > form > button').click()
  }

  async tonnageMaterialTableData() {
    const table = await $('table.govuk-table')
    await table.waitForExist({ timeout: 5000 })

    const headerElements = await $$('table.govuk-table thead th')
    const headers = []
    for (const el of headerElements) {
      const text = await el.getText()
      headers.push(text)
    }

    const rows = await $$('table.govuk-table tbody tr')
    const tableData = []

    for (const row of rows) {
      const cells = await row.$$('th, td')
      const rowData = {}

      for (let i = 0; i < headers.length; i++) {
        const cellText = await cells[i].getText()
        rowData[headers[i]] = cellText.trim()
      }

      tableData.push(rowData)
    }

    return tableData
  }
}

export default new TonnageMonitoringPage()
