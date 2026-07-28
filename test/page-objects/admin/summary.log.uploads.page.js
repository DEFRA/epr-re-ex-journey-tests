import { AdminPage } from 'page-objects/admin/page'

class SummaryLogUploadsPage extends AdminPage {
  open() {
    return super.open('/summary-log')
  }

  async fetchCsv() {
    return super.fetchCsv('/summary-log')
  }

  async totalRowsText() {
    return this.page.locator('p', { hasText: 'Total rows:' }).innerText()
  }

  tableText() {
    return this.page.locator('table.govuk-table').innerText()
  }
}

export { SummaryLogUploadsPage }
