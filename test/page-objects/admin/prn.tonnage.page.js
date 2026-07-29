import { AdminPage } from 'page-objects/admin/page'

class PrnTonnagePage extends AdminPage {
  open() {
    return super.open('/prn-tonnage')
  }

  async runReport() {
    await this.page.locator('a', { hasText: 'Run report' }).click()
  }

  async fetchCsv() {
    return super.fetchCsv('/prn-tonnage/results')
  }

  tableText() {
    return this.page.locator('table.govuk-table').innerText()
  }
}

export { PrnTonnagePage }
