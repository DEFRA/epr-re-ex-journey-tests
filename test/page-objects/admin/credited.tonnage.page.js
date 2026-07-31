import { AdminPage } from 'page-objects/admin/page'

class CreditedTonnagePage extends AdminPage {
  open() {
    return super.open('/credited-tonnage')
  }

  async fetchCsv() {
    return super.fetchCsv('/credited-tonnage')
  }

  tableText() {
    return this.page.locator('table.govuk-table').innerText()
  }
}

export { CreditedTonnagePage }
