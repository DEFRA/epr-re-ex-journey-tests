import { AdminPage } from 'page-objects/admin/page'

class PrnTonnagePage extends AdminPage {
  open() {
    return super.open('/prn-tonnage')
  }

  async runReport() {
    await this.page
      .getByRole('button', { name: 'Run report', exact: true })
      .click()
  }

  async fetchCsv() {
    return super.fetchCsv('/prn-tonnage/results')
  }

  tableText() {
    return this.page.locator('table.govuk-table').innerText()
  }
}

export { PrnTonnagePage }
